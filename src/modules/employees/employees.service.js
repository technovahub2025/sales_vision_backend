import mongoose from 'mongoose';
import { Employee } from '../../models/employee.model.js';
import { Contact } from '../../models/contact.model.js';
import { Team } from '../../models/team.model.js';
import { Task } from '../../models/task.model.js';
import { Lead } from '../../models/lead.model.js';
import { Activity } from '../../models/activity.model.js';
import { TimeLog } from '../../models/timeLog.model.js';
import { appendActivity } from '../activity/activity.service.js';
import { emitDomainEvent } from '../../sockets/emitters.js';
import { tasksService } from '../tasks/tasks.service.js';

const PROJECTION = {
  name: 1,
  email: 1,
  role: 1,
  department: 1,
  designation: 1,
  skills: 1,
  phone: 1,
  bio: 1,
  avatar: 1,
  avatarUrl: 1,
  capacity: 1,
  availability: 1,
  joinedAt: 1,
  employeeCode: 1,
  contactId: 1,
  manager: 1,
  teamIds: 1,
  team: 1,
  velocity: 1,
  status: 1,
  task: 1,
  updatedAt: 1,
  createdAt: 1,
};

const AVAILABILITY_ENUM = new Set(['available', 'busy', 'ooo', 'leave']);
const EMPLOYEE_STATUS_ENUM = new Set(['active', 'inactive', 'archived']);

function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  return error;
}

function normalizeText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function normalizeEmail(value) {
  const text = normalizeText(value, '').toLowerCase();
  return text;
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

function normalizeSkills(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function normalizeAvailability(value, existing = { status: 'available', until: null }) {
  if (value === undefined) return undefined;
  const statusRaw = String(value?.status || existing?.status || 'available').trim().toLowerCase();
  const status = AVAILABILITY_ENUM.has(statusRaw) ? statusRaw : 'available';
  const until = value?.until ? new Date(value.until) : null;
  return { status, until: Number.isNaN(until?.getTime?.()) ? null : until };
}

function normalizeCapacity(value, existing = { hoursPerWeek: 40 }) {
  if (value === undefined) return undefined;
  const parsed = Number(value?.hoursPerWeek ?? existing?.hoursPerWeek ?? 40);
  const hoursPerWeek = Number.isFinite(parsed) && parsed > 0 ? parsed : 40;
  return { hoursPerWeek };
}

function normalizeStatus(value, existing = 'active') {
  if (value === undefined) return undefined;
  const parsed = String(value || existing || 'active').trim().toLowerCase();
  return EMPLOYEE_STATUS_ENUM.has(parsed) ? parsed : 'active';
}

function parsePage(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}

function periodRange(period = 'week') {
  const now = new Date();
  const from = new Date(now);
  if (period === 'quarter') from.setDate(now.getDate() - 90);
  else if (period === 'month') from.setDate(now.getDate() - 30);
  else from.setDate(now.getDate() - 7);
  return { from, to: now };
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start, end };
}

function toObjectId(value) {
  if (!value) return null;
  try {
    return new mongoose.Types.ObjectId(String(value));
  } catch {
    return null;
  }
}

function requireWorkspaceObjectId(workspaceId) {
  const value = toObjectId(workspaceId);
  if (!value) {
    const error = new Error('Invalid workspaceId');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  return value;
}

function requireUserObjectId(userId) {
  const value = toObjectId(userId);
  if (!value) {
    const error = new Error('Invalid userId');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  return value;
}

async function ensureTeamIdsInWorkspace({ workspaceId, teamIds = [] }) {
  if (!teamIds.length) return [];
  const ids = teamIds
    .map((item) => parseNullableObjectId(item, 'teamIds'))
    .filter(Boolean)
    .map((item) => String(item));
  if (!ids.length) return [];
  const found = await Team.find({ workspaceId, _id: { $in: ids } }, { _id: 1 }).lean();
  if (found.length !== ids.length) {
    throw createValidationError('One or more teamIds are invalid for this workspace');
  }
  return ids.map((id) => new mongoose.Types.ObjectId(id));
}

async function validateManager({ workspaceId, manager }) {
  if (manager === undefined) return undefined;
  const managerId = parseNullableObjectId(manager?.id, 'manager.id');
  const managerName = normalizeText(manager?.name, '');
  if (!managerId) {
    return { id: null, name: managerName };
  }
  const found = await Employee.findOne({ workspaceId, _id: managerId }, { _id: 1, name: 1 }).lean();
  if (!found) {
    throw createValidationError('manager.id does not belong to this workspace');
  }
  return { id: managerId, name: managerName || normalizeText(found.name, '') };
}

async function ensureContactInWorkspace({ workspaceId, contactId }) {
  if (!contactId) return null;
  const contact = await Contact.findOne({ workspaceId, _id: contactId }, { _id: 1, employeeId: 1 }).lean();
  if (!contact) {
    throw createValidationError('contactId does not belong to this workspace');
  }
  return contact;
}

async function syncEmployeeContactLink({ workspaceId, employee, previousContactId = null, nextContactId = null, io }) {
  const prev = previousContactId ? String(previousContactId) : '';
  const next = nextContactId ? String(nextContactId) : '';

  if (prev && prev !== next) {
    const clearedContact = await Contact.findOneAndUpdate(
      { workspaceId, _id: previousContactId, employeeId: employee._id },
      { $set: { employeeId: null } },
      { new: true },
    ).lean();
    if (clearedContact) {
      emitDomainEvent(io, {
        workspaceId,
        moduleName: 'contacts',
        entity: 'contact',
        action: 'updated',
        data: clearedContact,
      });
    }
  }

  if (next) {
    const previousEmployee = await Employee.findOneAndUpdate(
      { workspaceId, contactId: nextContactId, _id: { $ne: employee._id } },
      { $set: { contactId: null } },
      { new: true, projection: PROJECTION },
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

    const linkedContact = await Contact.findOneAndUpdate(
      { workspaceId, _id: nextContactId },
      { $set: { employeeId: employee._id } },
      { new: true },
    ).lean();
    if (linkedContact) {
      emitDomainEvent(io, {
        workspaceId,
        moduleName: 'contacts',
        entity: 'contact',
        action: 'updated',
        data: linkedContact,
      });
    }
  }
}

async function buildCreatePayload({ workspaceId, data }) {
  const name = normalizeText(data?.name, '');
  if (!name) {
    throw createValidationError('name is required');
  }

  const availability = normalizeAvailability(data?.availability, { status: 'available', until: null });
  const capacity = normalizeCapacity(data?.capacity, { hoursPerWeek: 40 });
  const status = normalizeStatus(data?.status, 'active');
  const manager = await validateManager({ workspaceId, manager: data?.manager });
  const parsedTeamIds = await ensureTeamIdsInWorkspace({ workspaceId, teamIds: data?.teamIds || [] });
  const parsedContactId = parseNullableObjectId(data?.contactId, 'contactId');
  await ensureContactInWorkspace({ workspaceId, contactId: parsedContactId });

  const userId = parseNullableObjectId(data?.userId, 'userId');
  const joinedAtCandidate = data?.joinedAt ? new Date(data.joinedAt) : new Date();
  const joinedAt = Number.isNaN(joinedAtCandidate.getTime()) ? new Date() : joinedAtCandidate;

  return {
    workspaceId,
    userId: userId ?? null,
    contactId: parsedContactId ?? null,
    name,
    email: normalizeEmail(data?.email),
    role: normalizeText(data?.role, ''),
    department: normalizeText(data?.department, ''),
    designation: normalizeText(data?.designation, ''),
    skills: normalizeSkills(data?.skills),
    phone: normalizeText(data?.phone, ''),
    bio: normalizeText(data?.bio, ''),
    avatar: normalizeText(data?.avatar, ''),
    avatarUrl: normalizeText(data?.avatarUrl, ''),
    capacity: capacity || { hoursPerWeek: 40 },
    availability: availability || { status: 'available', until: null },
    joinedAt,
    employeeCode: normalizeText(data?.employeeCode, ''),
    manager: manager || { id: null, name: '' },
    teamIds: parsedTeamIds,
    team: normalizeText(data?.team, 'General') || 'General',
    velocity: Number.isFinite(Number(data?.velocity)) ? Number(data.velocity) : 0,
    status: status || 'active',
    task: normalizeText(data?.task, ''),
  };
}

async function buildUpdatePayload({ workspaceId, data, existing }) {
  const payload = {};
  if (data?.name !== undefined) {
    const name = normalizeText(data.name, '');
    if (!name) {
      throw createValidationError('name is required');
    }
    payload.name = name;
  }
  if (data?.email !== undefined) payload.email = normalizeEmail(data.email);
  if (data?.role !== undefined) payload.role = normalizeText(data.role, '');
  if (data?.department !== undefined) payload.department = normalizeText(data.department, '');
  if (data?.designation !== undefined) payload.designation = normalizeText(data.designation, '');
  if (data?.skills !== undefined) payload.skills = normalizeSkills(data.skills);
  if (data?.phone !== undefined) payload.phone = normalizeText(data.phone, '');
  if (data?.bio !== undefined) payload.bio = normalizeText(data.bio, '');
  if (data?.avatar !== undefined) payload.avatar = normalizeText(data.avatar, '');
  if (data?.avatarUrl !== undefined) payload.avatarUrl = normalizeText(data.avatarUrl, '');
  if (data?.employeeCode !== undefined) payload.employeeCode = normalizeText(data.employeeCode, '');
  if (data?.team !== undefined) payload.team = normalizeText(data.team, 'General') || 'General';
  if (data?.velocity !== undefined) payload.velocity = Number.isFinite(Number(data.velocity)) ? Number(data.velocity) : 0;
  if (data?.task !== undefined) payload.task = normalizeText(data.task, '');
  if (data?.status !== undefined) payload.status = normalizeStatus(data.status, existing?.status || 'active');
  if (data?.availability !== undefined) payload.availability = normalizeAvailability(data.availability, existing?.availability);
  if (data?.capacity !== undefined) payload.capacity = normalizeCapacity(data.capacity, existing?.capacity);
  if (data?.manager !== undefined) payload.manager = await validateManager({ workspaceId, manager: data.manager });
  if (data?.teamIds !== undefined) payload.teamIds = await ensureTeamIdsInWorkspace({ workspaceId, teamIds: data.teamIds || [] });
  if (data?.contactId !== undefined) {
    const parsedContactId = parseNullableObjectId(data.contactId, 'contactId');
    await ensureContactInWorkspace({ workspaceId, contactId: parsedContactId });
    payload.contactId = parsedContactId;
  }
  if (data?.userId !== undefined) payload.userId = parseNullableObjectId(data.userId, 'userId');
  return payload;
}

export const employeesService = {
  async list({ workspaceId, query = {} }) {
    const { page, limit, skip } = parsePage(query);
    const where = { workspaceId };
    if (query.department) where.department = query.department;
    if (query.role) where.role = query.role;
    if (query.availability) where['availability.status'] = query.availability;
    if (query.status) where.status = query.status;
    if (query.team) where.team = query.team;
    if (query.search) {
      const regex = new RegExp(String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      where.$or = [{ name: regex }, { email: regex }, { role: regex }, { department: regex }, { team: regex }];
    }

    const sort = (() => {
      const sortBy = String(query.sort || 'newest').toLowerCase();
      if (sortBy === 'oldest') return { updatedAt: 1, createdAt: 1, _id: 1 };
      if (sortBy === 'name') return { name: 1, updatedAt: -1 };
      if (sortBy === 'velocity') return { velocity: -1, updatedAt: -1 };
      if (sortBy === 'capacity') return { 'capacity.hoursPerWeek': -1, updatedAt: -1 };
      return { updatedAt: -1, createdAt: -1, _id: -1 };
    })();

    const [items, total] = await Promise.all([
      Employee.find(where, PROJECTION)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Employee.countDocuments(where),
    ]);
    return { items, meta: { page, limit, total } };
  },

  async getById({ workspaceId, id }) {
    return Employee.findOne({ workspaceId, _id: id }, PROJECTION).lean();
  },

  async create({ workspaceId, data, io }) {
    const payload = await buildCreatePayload({ workspaceId, data });

    const created = await Employee.create(payload);
    const employee = await Employee.findById(created._id, PROJECTION).lean();
    await syncEmployeeContactLink({
      workspaceId,
      employee,
      previousContactId: null,
      nextContactId: employee.contactId,
      io,
    });
    await appendActivity({
      workspaceId,
      module: 'employees',
      action: 'created',
      entity: 'employee',
      entityId: employee._id,
      payload: employee,
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'employees', entity: 'employee', action: 'updated', data: employee });
    return employee;
  },

  async update({ workspaceId, id, data, io }) {
    const existing = await Employee.findOne({ workspaceId, _id: id }, { contactId: 1, availability: 1, capacity: 1, status: 1 }).lean();
    if (!existing) return null;
    const payload = await buildUpdatePayload({ workspaceId, data, existing });

    const employee = await Employee.findOneAndUpdate(
      { workspaceId, _id: id },
      { $set: payload },
      { new: true, projection: PROJECTION },
    ).lean();
    if (!employee) return null;

    await syncEmployeeContactLink({
      workspaceId,
      employee,
      previousContactId: existing.contactId,
      nextContactId: employee.contactId,
      io,
    });

    await appendActivity({
      workspaceId,
      module: 'employees',
      action: 'updated',
      entity: 'employee',
      entityId: employee._id,
      payload,
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'employees', entity: 'employee', action: 'updated', data: employee });
    return employee;
  },

  async remove({ workspaceId, id, io }) {
    const employee = await Employee.findOneAndDelete({ workspaceId, _id: id }, PROJECTION).lean();
    if (!employee) return null;
    if (employee.contactId) {
      const clearedContact = await Contact.findOneAndUpdate(
        { workspaceId, _id: employee.contactId, employeeId: employee._id },
        { $set: { employeeId: null } },
        { new: true },
      ).lean();
      if (clearedContact) {
        emitDomainEvent(io, {
          workspaceId,
          moduleName: 'contacts',
          entity: 'contact',
          action: 'updated',
          data: clearedContact,
        });
      }
    }
    await Task.updateMany(
      { workspaceId, 'externalCollaborators.entityType': 'employee', 'externalCollaborators.entityId': employee._id },
      { $pull: { externalCollaborators: { entityType: 'employee', entityId: employee._id } } },
    );
    await appendActivity({
      workspaceId,
      module: 'employees',
      action: 'deleted',
      entity: 'employee',
      entityId: employee._id,
      payload: employee,
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'employees', entity: 'employee', action: 'deleted', data: employee });
    return employee;
  },

  async timeline({ workspaceId, id, query = {} }) {
    const { page, limit, skip } = parsePage(query);
    const where = {
      workspaceId,
      $or: [
        { 'actor.id': String(id) },
        { 'payload.employeeId': String(id) },
        { 'payload.assigneeId': String(id) },
      ],
    };
    const [items, total] = await Promise.all([
      Activity.find(where, { actor: 1, action: 1, entity: 1, entityId: 1, message: 1, payload: 1, occurredAt: 1 })
        .sort({ occurredAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Activity.countDocuments(where),
    ]);
    return { items, meta: { page, limit, total } };
  },

  async employeeTimeLogs({ workspaceId, id, query = {} }) {
    return tasksService.listTimeLogsByEmployee({ workspaceId, employeeId: id, query });
  },

  async projectTimeLogs({ workspaceId, projectId, query = {} }) {
    return tasksService.listTimeLogsByProject({ workspaceId, projectId, query });
  },

  async myTimeSummary({ workspaceId, employeeId, period = 'week' }) {
    const { from, to } = periodRange(period);
    const logs = await TimeLog.find(
      { workspaceId, employeeId, loggedAt: { $gte: from, $lte: to }, isDeleted: { $ne: true } },
      { durationMins: 1, loggedAt: 1 },
    ).lean();
    return {
      period,
      from,
      to,
      totalMins: logs.reduce((sum, row) => sum + Number(row.durationMins || 0), 0),
      count: logs.length,
    };
  },

  async performance({ workspaceId, id, period = 'week' }) {
    const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
    const userObjectId = requireUserObjectId(id);
    const { from, to } = periodRange(period);
    const [{ tasksCompleted = 0, tasksInProgress = 0, tasksOverdue = 0, storyPointsCompleted = 0 } = {}] =
      await Task.aggregate([
        { $match: { workspaceId: workspaceObjectId, assigneeIds: userObjectId } },
        {
          $group: {
            _id: null,
            tasksCompleted: {
              $sum: {
                $cond: [{ $in: ['$status', ['completed', 'done', 'closed']] }, 1, 0],
              },
            },
            tasksInProgress: {
              $sum: {
                $cond: [{ $in: ['$status', ['in_progress', 'in_review']] }, 1, 0],
              },
            },
            tasksOverdue: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $not: [{ $in: ['$status', ['completed', 'done', 'closed']] }] },
                      { $ne: ['$dueDate', null] },
                      { $lt: ['$dueDate', '$$NOW'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            storyPointsCompleted: {
              $sum: {
                $cond: [{ $in: ['$status', ['completed', 'done', 'closed']] }, { $ifNull: ['$points', 0] }, 0],
              },
            },
          },
        },
      ]);

    const logs = await TimeLog.find(
      { workspaceId, employeeId: id, loggedAt: { $gte: from, $lte: to }, isDeleted: { $ne: true } },
      { durationMins: 1, startTime: 1, endTime: 1, loggedAt: 1, taskId: 1 },
    ).lean();
    const totalMins = logs.reduce((sum, row) => sum + Number(row.durationMins || 0), 0);
    const avgCompletionHours = logs.length ? Number((totalMins / logs.length / 60).toFixed(2)) : 0;

    const leadCount = await Lead.countDocuments({
      workspaceId,
      assigneeId: id,
      updatedAt: { $gte: from, $lte: to },
      isArchived: { $ne: true },
    });

    const { start: todayStart, end: todayEnd } = todayRange();
    const dueToday = await Task.countDocuments({
      workspaceId,
      assigneeIds: id,
      dueDate: { $gte: todayStart, $lt: todayEnd },
    });

    const heatmapRows = await Activity.aggregate([
      { $match: { workspaceId: workspaceObjectId, occurredAt: { $gte: periodRange('quarter').from }, 'actor.id': String(id) } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$occurredAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', count: 1 } },
    ]);

    return {
      tasksCompleted,
      tasksInProgress,
      tasksOverdue,
      avgTaskCompletionTime: avgCompletionHours,
      totalTimeLogged: Number((totalMins / 60).toFixed(2)),
      onTimeDeliveryRate: tasksCompleted > 0 ? Math.max(0, Number((((tasksCompleted - tasksOverdue) / tasksCompleted) * 100).toFixed(1))) : 0,
      storyPointsCompleted,
      leadsHandled: leadCount,
      tasksDueToday: dueToday,
      activityHeatmap: heatmapRows,
    };
  },
};
