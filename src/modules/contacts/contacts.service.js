import mongoose from 'mongoose';
import { Contact } from '../../models/contact.model.js';
import { Employee } from '../../models/employee.model.js';
import { Task } from '../../models/task.model.js';
import { appendActivity } from '../activity/activity.service.js';
import { emitDomainEvent } from '../../sockets/emitters.js';

const CONTACT_STATUS_ENUM = new Set(['active', 'inactive']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createValidationError(message, statusCode = 400, code = 'VALIDATION_ERROR') {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function parsePage(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 200);
  return { page, limit, skip: (page - 1) * limit };
}

function normalizeText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function normalizeEmail(value) {
  return normalizeText(value, '').toLowerCase();
}

function parseNullableObjectId(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  try {
    return new mongoose.Types.ObjectId(String(value));
  } catch {
    throw createValidationError(`${fieldName} is invalid`);
  }
}

async function ensureEmployeeInWorkspace({ workspaceId, employeeId }) {
  if (!employeeId) return null;
  const employee = await Employee.findOne({ workspaceId, _id: employeeId }, { _id: 1, contactId: 1 }).lean();
  if (!employee) {
    throw createValidationError('employeeId does not belong to this workspace');
  }
  return employee;
}

async function ensureUniqueEmail({ workspaceId, email, excludeId = null }) {
  if (!email) return;
  if (!EMAIL_REGEX.test(email)) {
    throw createValidationError('email format is invalid');
  }
  const where = { workspaceId, email };
  if (excludeId) {
    where._id = { $ne: excludeId };
  }
  const existing = await Contact.findOne(where, { _id: 1 }).lean();
  if (existing) {
    throw createValidationError('Contact email already exists in this workspace', 409, 'CONFLICT');
  }
}

async function syncContactEmployeeLink({ workspaceId, contact, previousEmployeeId = null, nextEmployeeId = null, io }) {
  const prev = previousEmployeeId ? String(previousEmployeeId) : '';
  const next = nextEmployeeId ? String(nextEmployeeId) : '';

  if (prev && prev !== next) {
    const previousEmployee = await Employee.findOneAndUpdate(
      { workspaceId, _id: previousEmployeeId, contactId: contact._id },
      { $set: { contactId: null } },
      { new: true },
    ).lean();
    if (previousEmployee) {
      emitDomainEvent(io, {
        workspaceId,
        moduleName: 'employees',
        entity: 'employee',
        action: 'updated',
        data: previousEmployee,
      });
    }
  }

  if (!next) return;

  const previousContact = await Contact.findOneAndUpdate(
    { workspaceId, employeeId: nextEmployeeId, _id: { $ne: contact._id } },
    { $set: { employeeId: null } },
    { new: true },
  ).lean();

  if (previousContact) {
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'contacts',
      entity: 'contact',
      action: 'updated',
      data: previousContact,
    });
  }

  const linkedEmployee = await Employee.findOneAndUpdate(
    { workspaceId, _id: nextEmployeeId },
    { $set: { contactId: contact._id } },
    { new: true },
  ).lean();

  if (linkedEmployee) {
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'employees',
      entity: 'employee',
      action: 'updated',
      data: linkedEmployee,
    });
  }
}

function normalizeStatus(value, existing = 'active') {
  const statusRaw = normalizeText(value === undefined ? existing : value, 'active').toLowerCase();
  return CONTACT_STATUS_ENUM.has(statusRaw) ? statusRaw : 'active';
}

function normalizeCustomFields(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

async function buildCreatePayload({ workspaceId, data }) {
  const name = normalizeText(data?.name, '');
  if (!name) {
    throw createValidationError('name is required');
  }
  const email = normalizeEmail(data?.email);
  await ensureUniqueEmail({ workspaceId, email });
  const employeeId = parseNullableObjectId(data?.employeeId, 'employeeId');
  await ensureEmployeeInWorkspace({ workspaceId, employeeId });

  return {
    workspaceId,
    name,
    company: normalizeText(data?.company, ''),
    role: normalizeText(data?.role, ''),
    department: normalizeText(data?.department, ''),
    email,
    phone: normalizeText(data?.phone, ''),
    website: normalizeText(data?.website, ''),
    address: normalizeText(data?.address, ''),
    status: normalizeStatus(data?.status, 'active'),
    project: normalizeText(data?.project, ''),
    avatarUrl: normalizeText(data?.avatarUrl, ''),
    employeeId: employeeId ?? null,
    customFields: normalizeCustomFields(data?.customFields),
  };
}

async function buildUpdatePayload({ workspaceId, data, existing, id }) {
  const payload = {};
  if (data?.name !== undefined) {
    const name = normalizeText(data.name, '');
    if (!name) {
      throw createValidationError('name is required');
    }
    payload.name = name;
  }
  if (data?.company !== undefined) payload.company = normalizeText(data.company, '');
  if (data?.role !== undefined) payload.role = normalizeText(data.role, '');
  if (data?.department !== undefined) payload.department = normalizeText(data.department, '');
  if (data?.email !== undefined) {
    const email = normalizeEmail(data.email);
    await ensureUniqueEmail({ workspaceId, email, excludeId: id });
    payload.email = email;
  }
  if (data?.phone !== undefined) payload.phone = normalizeText(data.phone, '');
  if (data?.website !== undefined) payload.website = normalizeText(data.website, '');
  if (data?.address !== undefined) payload.address = normalizeText(data.address, '');
  if (data?.status !== undefined) payload.status = normalizeStatus(data.status, existing?.status || 'active');
  if (data?.project !== undefined) payload.project = normalizeText(data.project, '');
  if (data?.avatarUrl !== undefined) payload.avatarUrl = normalizeText(data.avatarUrl, '');
  if (data?.customFields !== undefined) payload.customFields = normalizeCustomFields(data.customFields);

  if (data?.employeeId !== undefined) {
    const employeeId = parseNullableObjectId(data.employeeId, 'employeeId');
    await ensureEmployeeInWorkspace({ workspaceId, employeeId });
    payload.employeeId = employeeId;
  }

  return payload;
}

export const contactsService = {
  async list({ workspaceId, query = {} }) {
    const { page, limit, skip } = parsePage(query);
    const where = { workspaceId };

    if (query.department) where.department = query.department;
    if (query.status) where.status = query.status;
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.search) {
      const escaped = String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      where.$or = [{ name: regex }, { email: regex }, { role: regex }, { department: regex }, { company: regex }];
    }

    const sort = (() => {
      const sortBy = String(query.sort || 'recent').toLowerCase();
      if (sortBy === 'name') return { name: 1, updatedAt: -1 };
      if (sortBy === 'department') return { department: 1, updatedAt: -1 };
      return { updatedAt: -1 };
    })();

    const [items, total] = await Promise.all([
      Contact.find(where).sort(sort).skip(skip).limit(limit).lean(),
      Contact.countDocuments(where),
    ]);

    return { items, meta: { page, limit, total } };
  },

  async getById({ workspaceId, id }) {
    return Contact.findOne({ workspaceId, _id: id }).lean();
  },

  async create({ workspaceId, data, io }) {
    const payload = await buildCreatePayload({ workspaceId, data });
    const created = await Contact.create(payload);
    const contact = await Contact.findById(created._id).lean();

    await syncContactEmployeeLink({
      workspaceId,
      contact,
      previousEmployeeId: null,
      nextEmployeeId: contact.employeeId,
      io,
    });

    await appendActivity({
      workspaceId,
      module: 'contacts',
      action: 'created',
      entity: 'contact',
      entityId: contact._id,
      payload: contact,
    });

    emitDomainEvent(io, { workspaceId, moduleName: 'contacts', entity: 'contact', action: 'created', data: contact });
    return contact;
  },

  async update({ workspaceId, id, data, io }) {
    const existing = await Contact.findOne({ workspaceId, _id: id }, { employeeId: 1, status: 1 }).lean();
    if (!existing) return null;

    const payload = await buildUpdatePayload({ workspaceId, data, existing, id });
    const updated = await Contact.findOneAndUpdate({ workspaceId, _id: id }, { $set: payload }, { new: true }).lean();
    if (!updated) return null;

    await syncContactEmployeeLink({
      workspaceId,
      contact: updated,
      previousEmployeeId: existing.employeeId,
      nextEmployeeId: updated.employeeId,
      io,
    });

    await appendActivity({
      workspaceId,
      module: 'contacts',
      action: 'updated',
      entity: 'contact',
      entityId: updated._id,
      payload: updated,
    });

    emitDomainEvent(io, { workspaceId, moduleName: 'contacts', entity: 'contact', action: 'updated', data: updated });
    return updated;
  },

  async remove({ workspaceId, id, io }) {
    const removed = await Contact.findOneAndDelete({ workspaceId, _id: id }).lean();
    if (!removed) return null;

    if (removed.employeeId) {
      const employee = await Employee.findOneAndUpdate(
        { workspaceId, _id: removed.employeeId, contactId: removed._id },
        { $set: { contactId: null } },
        { new: true },
      ).lean();
      if (employee) {
        emitDomainEvent(io, {
          workspaceId,
          moduleName: 'employees',
          entity: 'employee',
          action: 'updated',
          data: employee,
        });
      }
    }

    await Task.updateMany(
      { workspaceId, 'externalCollaborators.entityType': 'contact', 'externalCollaborators.entityId': removed._id },
      { $pull: { externalCollaborators: { entityType: 'contact', entityId: removed._id } } },
    );

    await appendActivity({
      workspaceId,
      module: 'contacts',
      action: 'deleted',
      entity: 'contact',
      entityId: removed._id,
      payload: removed,
    });

    emitDomainEvent(io, { workspaceId, moduleName: 'contacts', entity: 'contact', action: 'deleted', data: removed });
    return removed;
  },
};
