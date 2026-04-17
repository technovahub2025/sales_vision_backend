import mongoose from 'mongoose';
import { Client } from '../../models/client.model.js';
import { Lead } from '../../models/lead.model.js';
import { Project } from '../../models/project.model.js';
import { appendActivity } from '../activity/activity.service.js';
import { emitDomainEvent, emitCoalesced } from '../../sockets/emitters.js';

function toObjectId(input) {
  try {
    return new mongoose.Types.ObjectId(String(input));
  } catch {
    return null;
  }
}

function pageQuery(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function resolveArchiveFilter(query = {}) {
  const includeArchived = String(query.includeArchived || '').toLowerCase() === 'true';
  const onlyArchived = String(query.onlyArchived || '').toLowerCase() === 'true';
  if (onlyArchived) return { isArchived: true };
  if (includeArchived) return {};
  return { isArchived: { $ne: true } };
}

async function emitClientMutation({ io, workspaceId, action, client }) {
  emitDomainEvent(io, { workspaceId, moduleName: 'clients', entity: 'client', action, data: client });
  emitDomainEvent(io, {
    workspaceId,
    moduleName: 'activity',
    entity: 'activity',
    action: 'appended',
    data: { entity: 'client', action },
  });
  emitCoalesced(io, `dashboard:${workspaceId}`, () =>
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'dashboard',
      entity: 'dashboard',
      action: 'updated',
      data: { workspaceId },
    }),
  );
}

export const clientsService = {
  async list({ workspaceId, query = {} }) {
    const { page, limit, skip } = pageQuery(query);
    const where = { workspaceId, ...resolveArchiveFilter(query) };
    if (query.status) where.status = query.status;
    if (query.assigneeId) {
      const id = toObjectId(query.assigneeId);
      if (id) where.assigneeId = id;
    }
    if (query.search) {
      const rx = new RegExp(String(query.search).trim(), 'i');
      where.$or = [{ name: rx }, { email: rx }, { company: rx }];
    }

    const [items, total] = await Promise.all([
      Client.find(where, {
        isArchived: 1,
        name: 1,
        email: 1,
        phone: 1,
        company: 1,
        industry: 1,
        website: 1,
        address: 1,
        contactName: 1,
        designation: 1,
        alternatePhone: 1,
        taxId: 1,
        city: 1,
        state: 1,
        country: 1,
        pincode: 1,
        customFields: 1,
        assigneeId: 1,
        tags: 1,
        status: 1,
        updatedAt: 1,
      })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Client.countDocuments(where),
    ]);

    return { items, meta: { page, limit, total } };
  },

  async create({ workspaceId, data, io }) {
    const payload = {
      workspaceId,
      name: String(data?.name || '').trim(),
      email: String(data?.email || ''),
      phone: String(data?.phone || ''),
      company: String(data?.company || ''),
      industry: String(data?.industry || ''),
      website: String(data?.website || ''),
      address: String(data?.address || ''),
      contactName: String(data?.contactName || ''),
      designation: String(data?.designation || ''),
      alternatePhone: String(data?.alternatePhone || ''),
      taxId: String(data?.taxId || ''),
      city: String(data?.city || ''),
      state: String(data?.state || ''),
      country: String(data?.country || ''),
      pincode: String(data?.pincode || ''),
      customFields: data?.customFields && typeof data.customFields === 'object' ? data.customFields : {},
      assigneeId: data?.assigneeId || undefined,
      tags: Array.isArray(data?.tags) ? data.tags : [],
      notes: Array.isArray(data?.notes) ? data.notes : [],
      status: data?.status || 'prospect',
    };
    if (!payload.name) throw new Error('name is required');
    const created = await Client.create(payload);
    const client = await Client.findById(created._id).lean();

    await appendActivity({
      workspaceId,
      module: 'clients',
      action: 'created',
      entity: 'client',
      entityId: client._id,
      payload: client,
    });
    await emitClientMutation({ io, workspaceId, action: 'created', client });
    return client;
  },

  async getById({ workspaceId, id }) {
    const clientObjectId = toObjectId(id);
    const projectLinkMatch = clientObjectId
      ? {
          $or: [
            { clientId: clientObjectId },
            { [`metadata.clientId`]: String(clientObjectId) },
          ],
        }
      : { [`metadata.clientId`]: String(id) };

    const client = await Client.findOne(
      { _id: id, workspaceId, isArchived: { $ne: true } },
      {
        name: 1,
        email: 1,
        phone: 1,
        company: 1,
        industry: 1,
        website: 1,
        address: 1,
        contactName: 1,
        designation: 1,
        alternatePhone: 1,
        taxId: 1,
        city: 1,
        state: 1,
        country: 1,
        pincode: 1,
        customFields: 1,
        assigneeId: 1,
        tags: 1,
        notes: 1,
        status: 1,
        updatedAt: 1,
        createdAt: 1,
      },
    ).lean();
    if (!client) return null;

    const [linkedLeads, linkedProjects] = await Promise.all([
      Lead.find({ workspaceId, clientId: client._id, isArchived: { $ne: true } }, { title: 1, statusId: 1, value: 1, expectedCloseDate: 1, updatedAt: 1 })
        .sort({ updatedAt: -1 })
        .lean(),
      Project.find(
        { workspaceId, ...projectLinkMatch },
        { name: 1, status: 1, progress: 1, clientId: 1, updatedAt: 1 },
      )
        .sort({ updatedAt: -1 })
        .lean(),
    ]);

    return { ...client, linkedLeads, linkedProjects };
  },

  async update({ workspaceId, id, data, io }) {
    const payload = {
      ...(data.name !== undefined ? { name: String(data.name || '').trim() } : {}),
      ...(data.email !== undefined ? { email: String(data.email || '') } : {}),
      ...(data.phone !== undefined ? { phone: String(data.phone || '') } : {}),
      ...(data.company !== undefined ? { company: String(data.company || '') } : {}),
      ...(data.industry !== undefined ? { industry: String(data.industry || '') } : {}),
      ...(data.website !== undefined ? { website: String(data.website || '') } : {}),
      ...(data.address !== undefined ? { address: String(data.address || '') } : {}),
      ...(data.contactName !== undefined ? { contactName: String(data.contactName || '') } : {}),
      ...(data.designation !== undefined ? { designation: String(data.designation || '') } : {}),
      ...(data.alternatePhone !== undefined ? { alternatePhone: String(data.alternatePhone || '') } : {}),
      ...(data.taxId !== undefined ? { taxId: String(data.taxId || '') } : {}),
      ...(data.city !== undefined ? { city: String(data.city || '') } : {}),
      ...(data.state !== undefined ? { state: String(data.state || '') } : {}),
      ...(data.country !== undefined ? { country: String(data.country || '') } : {}),
      ...(data.pincode !== undefined ? { pincode: String(data.pincode || '') } : {}),
      ...(data.customFields !== undefined
        ? { customFields: data.customFields && typeof data.customFields === 'object' ? data.customFields : {} }
        : {}),
      ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId || null } : {}),
      ...(data.tags !== undefined ? { tags: Array.isArray(data.tags) ? data.tags : [] } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
    };
    const client = await Client.findOneAndUpdate(
      { _id: id, workspaceId, isArchived: { $ne: true } },
      { $set: payload },
      {
        new: true,
        projection: {
          name: 1,
          email: 1,
          phone: 1,
          company: 1,
          industry: 1,
          website: 1,
          address: 1,
          contactName: 1,
          designation: 1,
          alternatePhone: 1,
          taxId: 1,
          city: 1,
          state: 1,
          country: 1,
          pincode: 1,
          customFields: 1,
          assigneeId: 1,
          tags: 1,
          notes: 1,
          status: 1,
          updatedAt: 1,
        },
      },
    ).lean();
    if (!client) return null;

    await appendActivity({
      workspaceId,
      module: 'clients',
      action: 'updated',
      entity: 'client',
      entityId: client._id,
      payload: client,
    });
    await emitClientMutation({ io, workspaceId, action: 'updated', client });
    return client;
  },

  async remove({ workspaceId, id, io }) {
    const client = await Client.findOneAndUpdate(
      { _id: id, workspaceId, isArchived: { $ne: true } },
      { $set: { isArchived: true } },
      { new: true, projection: { name: 1, email: 1, company: 1, phone: 1, status: 1, isArchived: 1, updatedAt: 1 } },
    ).lean();
    if (!client) return null;

    await appendActivity({
      workspaceId,
      module: 'clients',
      action: 'deleted',
      entity: 'client',
      entityId: client._id,
      payload: client,
    });
    await emitClientMutation({ io, workspaceId, action: 'deleted', client });
    return client;
  },

  async restore({ workspaceId, id, io }) {
    const client = await Client.findOneAndUpdate(
      { _id: id, workspaceId, isArchived: true },
      { $set: { isArchived: false } },
      { new: true, projection: { name: 1, email: 1, company: 1, phone: 1, status: 1, isArchived: 1, updatedAt: 1 } },
    ).lean();
    if (!client) return null;

    await appendActivity({
      workspaceId,
      module: 'clients',
      action: 'restored',
      entity: 'client',
      entityId: client._id,
      payload: client,
    });
    await emitClientMutation({ io, workspaceId, action: 'updated', client });
    return client;
  },

  async clientLeads({ workspaceId, id }) {
    return Lead.find(
      { workspaceId, clientId: id, isArchived: { $ne: true } },
      { title: 1, statusId: 1, priority: 1, source: 1, value: 1, expectedCloseDate: 1, nextFollowUp: 1, updatedAt: 1 },
    )
      .sort({ updatedAt: -1 })
      .lean();
  },

  async clientProjects({ workspaceId, id }) {
    const clientObjectId = toObjectId(id);
    const match = clientObjectId
      ? {
          $or: [
            { clientId: clientObjectId },
            { [`metadata.clientId`]: String(clientObjectId) },
          ],
        }
      : { [`metadata.clientId`]: String(id) };

    return Project.find(
      { workspaceId, ...match },
      { name: 1, status: 1, progress: 1, ownerId: 1, clientId: 1, updatedAt: 1 },
    )
      .sort({ updatedAt: -1 })
      .lean();
  },

  async addNote({ workspaceId, id, body, actor = 'workspace-actor', io }) {
    const note = { body: String(body || '').trim(), createdBy: actor, createdAt: new Date() };
    if (!note.body) throw new Error('note is required');

    const client = await Client.findOneAndUpdate(
      { _id: id, workspaceId, isArchived: { $ne: true } },
      { $push: { notes: note } },
      { new: true, projection: { name: 1, notes: 1, status: 1, updatedAt: 1 } },
    ).lean();
    if (!client) return null;

    await appendActivity({
      workspaceId,
      module: 'clients',
      action: 'note_added',
      entity: 'client',
      entityId: client._id,
      payload: note,
    });
    await emitClientMutation({ io, workspaceId, action: 'updated', client });
    return client;
  },
};
