import mongoose from 'mongoose';
import { Lead } from '../../models/lead.model.js';
import { Project } from '../../models/project.model.js';
import { appendActivity } from '../activity/activity.service.js';
import { emitCoalesced, emitDomainEvent } from '../../sockets/emitters.js';
import { invalidateDashboardCache } from '../dashboard/dashboard.service.js';
import { validateCustomFields } from '../customFields/customFields.service.js';

const DEFAULT_STAGES = [
  { id: 'new', title: 'New' },
  { id: 'contacted', title: 'Contacted' },
  { id: 'qualified', title: 'Qualified' },
  { id: 'proposal_sent', title: 'Proposal Sent' },
  { id: 'negotiation', title: 'Negotiation' },
  { id: 'won', title: 'Won' },
  { id: 'lost', title: 'Lost' },
];

function toObjectId(input) {
  try {
    return new mongoose.Types.ObjectId(String(input));
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

function listQuery(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function listSort(sort = 'updatedAt') {
  if (sort === 'value') return { value: -1, updatedAt: -1 };
  if (sort === 'expectedCloseDate') return { expectedCloseDate: 1, updatedAt: -1 };
  return { updatedAt: -1 };
}

function resolveArchiveFilter(query = {}) {
  const includeArchived = String(query.includeArchived || '').toLowerCase() === 'true';
  const onlyArchived = String(query.onlyArchived || '').toLowerCase() === 'true';
  if (onlyArchived) return { isArchived: true };
  if (includeArchived) return {};
  return { isArchived: { $ne: true } };
}

function buildFilters(workspaceId, query = {}) {
  const where = { workspaceId, ...resolveArchiveFilter(query) };
  if (query.assigneeId) {
    const id = toObjectId(query.assigneeId);
    if (id) where.assigneeId = id;
  }
  if (query.statusId) where.statusId = String(query.statusId);
  if (query.priority) where.priority = String(query.priority).toLowerCase();
  if (query.source) where.source = String(query.source).toLowerCase();
  if (query.clientId) {
    const id = toObjectId(query.clientId);
    if (id) where.clientId = id;
  }
  if (query.from || query.to) {
    where.updatedAt = {};
    if (query.from) where.updatedAt.$gte = new Date(query.from);
    if (query.to) where.updatedAt.$lte = new Date(query.to);
  }
  return where;
}

async function emitLeadMutation({ io, workspaceId, action, lead }) {
  emitDomainEvent(io, { workspaceId, moduleName: 'leads', entity: 'lead', action, data: lead });
  emitDomainEvent(io, {
    workspaceId,
    moduleName: 'activity',
    entity: 'activity',
    action: 'appended',
    data: { entity: 'lead', action },
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
  await invalidateDashboardCache({ workspaceId, io, trigger: 'lead:updated' });
}

export const leadsService = {
  async pipeline({ workspaceId, query = {} }) {
    const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
    const archiveFilter = resolveArchiveFilter(query);
    const leads = await Lead.aggregate([
      { $match: { workspaceId: workspaceObjectId, ...archiveFilter } },
      {
        $group: {
          _id: '$statusId',
          count: { $sum: 1 },
          totalValue: { $sum: { $ifNull: ['$value', 0] } },
          items: {
            $push: {
              _id: '$_id',
              title: '$title',
              value: '$value',
              priority: '$priority',
              source: '$source',
              assigneeId: '$assigneeId',
              nextFollowUp: '$nextFollowUp',
              expectedCloseDate: '$expectedCloseDate',
              updatedAt: '$updatedAt',
            },
          },
        },
      },
      { $project: { _id: 0, statusId: '$_id', count: 1, totalValue: 1, items: 1 } },
    ]);

    const grouped = new Map(leads.map((item) => [item.statusId, item]));
    return DEFAULT_STAGES.map((stage) => {
      const hit = grouped.get(stage.id);
      return {
        statusId: stage.id,
        title: stage.title,
        count: hit?.count || 0,
        totalValue: hit?.totalValue || 0,
        items: hit?.items || [],
      };
    });
  },

  async list({ workspaceId, query }) {
    const { page, limit, skip } = listQuery(query);
    const where = buildFilters(workspaceId, query);

    const [items, total] = await Promise.all([
      Lead.find(where, {
        isArchived: 1,
        title: 1,
        statusId: 1,
        stage: 1,
        priority: 1,
        source: 1,
        value: 1,
        currency: 1,
        assigneeId: 1,
        clientId: 1,
        expectedCloseDate: 1,
        nextFollowUp: 1,
        tags: 1,
        customFields: 1,
        updatedAt: 1,
      })
        .sort(listSort(query?.sort))
        .skip(skip)
        .limit(limit)
        .lean(),
      Lead.countDocuments(where),
    ]);

    return { items, meta: { page, limit, total } };
  },

  async getById({ workspaceId, id }) {
    return Lead.findOne({ _id: id, workspaceId, isArchived: { $ne: true } }, {
      title: 1,
      stage: 1,
      workflowId: 1,
      statusId: 1,
      assigneeId: 1,
      clientId: 1,
      value: 1,
      currency: 1,
      source: 1,
      priority: 1,
      expectedCloseDate: 1,
      tags: 1,
      customFields: 1,
      notes: 1,
      nextFollowUp: 1,
      updatedAt: 1,
      createdAt: 1,
    }).lean();
  },

  async create({ workspaceId, data, io }) {
    if (data?.customFields) {
      const validation = await validateCustomFields('lead', data.customFields, workspaceId);
      if (!validation.valid) throw new Error(validation.message);
    }
    const payload = {
      workspaceId,
      title: String(data?.title || '').trim(),
      stage: data?.statusId || data?.stage || 'new',
      workflowId: data?.workflowId || 'default-lead-pipeline',
      statusId: data?.statusId || data?.stage || 'new',
      assigneeId: data?.assigneeId || undefined,
      clientId: data?.clientId || undefined,
      value: Number(data?.value || 0),
      currency: data?.currency || 'USD',
      source: data?.source || 'organic',
      priority: data?.priority || 'warm',
      expectedCloseDate: data?.expectedCloseDate || undefined,
      tags: Array.isArray(data?.tags) ? data.tags : [],
      customFields: data?.customFields && typeof data.customFields === 'object' ? data.customFields : {},
      attachments: Array.isArray(data?.attachments) ? data.attachments : [],
      notes: Array.isArray(data?.notes) ? data.notes : [],
      nextFollowUp: data?.nextFollowUp || undefined,
      owner: data?.owner || '',
      health: data?.health || 'healthy',
      dueDate: data?.dueDate || undefined,
    };
    if (!payload.title) {
      throw new Error('title is required');
    }

    const created = await Lead.create(payload);
    const lead = await Lead.findById(created._id).lean();

    await appendActivity({
      workspaceId,
      module: 'leads',
      action: 'created',
      entity: 'lead',
      entityId: lead._id,
      payload: lead,
    });

    await emitLeadMutation({ io, workspaceId, action: 'created', lead });
    return lead;
  },

  async update({ workspaceId, id, data, io }) {
    if (data?.customFields) {
      const validation = await validateCustomFields('lead', data.customFields, workspaceId);
      if (!validation.valid) throw new Error(validation.message);
    }
    const payload = {
      ...(data.title !== undefined ? { title: String(data.title || '').trim() } : {}),
      ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId || null } : {}),
      ...(data.clientId !== undefined ? { clientId: data.clientId || null } : {}),
      ...(data.value !== undefined ? { value: Number(data.value || 0) } : {}),
      ...(data.currency !== undefined ? { currency: data.currency || 'USD' } : {}),
      ...(data.source !== undefined ? { source: data.source } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
      ...(data.expectedCloseDate !== undefined ? { expectedCloseDate: data.expectedCloseDate || null } : {}),
      ...(data.tags !== undefined ? { tags: Array.isArray(data.tags) ? data.tags : [] } : {}),
      ...(data.customFields !== undefined ? { customFields: data.customFields && typeof data.customFields === 'object' ? data.customFields : {} } : {}),
      ...(data.attachments !== undefined ? { attachments: Array.isArray(data.attachments) ? data.attachments : [] } : {}),
      ...(data.nextFollowUp !== undefined ? { nextFollowUp: data.nextFollowUp || null } : {}),
      ...(data.owner !== undefined ? { owner: data.owner || '' } : {}),
      ...(data.health !== undefined ? { health: data.health || 'healthy' } : {}),
    };

    const lead = await Lead.findOneAndUpdate(
      { _id: id, workspaceId, isArchived: { $ne: true } },
      { $set: payload },
      {
        new: true,
        projection: {
          title: 1,
          stage: 1,
          statusId: 1,
          priority: 1,
          source: 1,
          value: 1,
          currency: 1,
          assigneeId: 1,
          clientId: 1,
          expectedCloseDate: 1,
          nextFollowUp: 1,
          tags: 1,
          customFields: 1,
          notes: 1,
          updatedAt: 1,
        },
      },
    ).lean();
    if (!lead) return null;

    await appendActivity({
      workspaceId,
      module: 'leads',
      action: 'updated',
      entity: 'lead',
      entityId: lead._id,
      payload: lead,
    });

    await emitLeadMutation({ io, workspaceId, action: 'updated', lead });
    return lead;
  },

  async transitionStatus({ workspaceId, id, statusId, io }) {
    const lead = await Lead.findOneAndUpdate(
      { _id: id, workspaceId, isArchived: { $ne: true } },
      { $set: { statusId, stage: statusId } },
      {
        new: true,
        projection: {
          title: 1,
          statusId: 1,
          stage: 1,
          priority: 1,
          source: 1,
          value: 1,
          currency: 1,
          assigneeId: 1,
          clientId: 1,
          expectedCloseDate: 1,
          customFields: 1,
          updatedAt: 1,
        },
      },
    ).lean();
    if (!lead) return null;

    await appendActivity({
      workspaceId,
      module: 'leads',
      action: 'moved',
      entity: 'lead',
      entityId: lead._id,
      payload: { statusId },
    });

    await emitLeadMutation({ io, workspaceId, action: 'moved', lead });
    return lead;
  },

  async remove({ workspaceId, id, io }) {
    const lead = await Lead.findOneAndUpdate(
      { _id: id, workspaceId, isArchived: { $ne: true } },
      { $set: { isArchived: true } },
      { new: true, projection: { title: 1, statusId: 1, priority: 1, source: 1, value: 1, assigneeId: 1, clientId: 1, updatedAt: 1 } },
    ).lean();
    if (!lead) return null;

    await appendActivity({
      workspaceId,
      module: 'leads',
      action: 'deleted',
      entity: 'lead',
      entityId: lead._id,
      payload: lead,
    });
    await emitLeadMutation({ io, workspaceId, action: 'deleted', lead });
    return lead;
  },

  async restore({ workspaceId, id, io }) {
    const lead = await Lead.findOneAndUpdate(
      { _id: id, workspaceId, isArchived: true },
      { $set: { isArchived: false } },
      { new: true, projection: { title: 1, statusId: 1, priority: 1, source: 1, value: 1, assigneeId: 1, clientId: 1, isArchived: 1, updatedAt: 1 } },
    ).lean();
    if (!lead) return null;

    await appendActivity({
      workspaceId,
      module: 'leads',
      action: 'restored',
      entity: 'lead',
      entityId: lead._id,
      payload: lead,
    });
    await emitLeadMutation({ io, workspaceId, action: 'updated', lead });
    return lead;
  },

  async getActivity({ workspaceId, id, query = {} }) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;
    const where = { workspaceId, entity: 'lead', entityId: String(id) };

    const [items, total] = await Promise.all([
      (await import('../../models/activity.model.js')).Activity.find(where, {
        actor: 1,
        action: 1,
        entity: 1,
        entityId: 1,
        message: 1,
        payload: 1,
        occurredAt: 1,
      })
        .sort({ occurredAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      (await import('../../models/activity.model.js')).Activity.countDocuments(where),
    ]);

    return { items, meta: { page, limit, total } };
  },

  async addNote({ workspaceId, id, body, actor = 'workspace-actor', io }) {
    const note = { body: String(body || '').trim(), createdBy: actor, createdAt: new Date() };
    if (!note.body) throw new Error('note is required');

    const lead = await Lead.findOneAndUpdate(
      { _id: id, workspaceId, isArchived: { $ne: true } },
      { $push: { notes: note } },
      { new: true, projection: { title: 1, statusId: 1, notes: 1, updatedAt: 1 } },
    ).lean();
    if (!lead) return null;

    await appendActivity({
      workspaceId,
      module: 'leads',
      action: 'note_added',
      entity: 'lead',
      entityId: lead._id,
      payload: note,
    });
    await emitLeadMutation({ io, workspaceId, action: 'updated', lead });
    return lead;
  },

  async scheduleFollowUp({ workspaceId, id, nextFollowUp, io }) {
    const lead = await Lead.findOneAndUpdate(
      { _id: id, workspaceId, isArchived: { $ne: true } },
      { $set: { nextFollowUp: nextFollowUp ? new Date(nextFollowUp) : null } },
      { new: true, projection: { title: 1, statusId: 1, nextFollowUp: 1, updatedAt: 1 } },
    ).lean();
    if (!lead) return null;

    await appendActivity({
      workspaceId,
      module: 'leads',
      action: 'follow_up_scheduled',
      entity: 'lead',
      entityId: lead._id,
      payload: { nextFollowUp: lead.nextFollowUp },
    });
    await emitLeadMutation({ io, workspaceId, action: 'updated', lead });
    return lead;
  },

  async addAttachment({ workspaceId, id, data, io }) {
    const attachment = {
      url: String(data?.url || '').trim(),
      filename: String(data?.filename || '').trim(),
      size: Number(data?.size || 0),
      mimeType: String(data?.mimeType || ''),
      uploadedBy: data?.uploadedBy || null,
      uploadedAt: new Date(),
    };
    if (!attachment.url || !attachment.filename) {
      throw new Error('url and filename are required');
    }

    const lead = await Lead.findOneAndUpdate(
      { _id: id, workspaceId, isArchived: { $ne: true } },
      { $push: { attachments: attachment } },
      { new: true, projection: { title: 1, attachments: 1, updatedAt: 1, statusId: 1, priority: 1, source: 1, value: 1 } },
    ).lean();
    if (!lead) return null;

    const saved = lead.attachments[lead.attachments.length - 1];
    await appendActivity({
      workspaceId,
      module: 'leads',
      action: 'attachment_created',
      entity: 'lead',
      entityId: id,
      payload: saved,
    });
    await emitLeadMutation({ io, workspaceId, action: 'updated', lead });
    return saved;
  },

  async removeAttachment({ workspaceId, id, attachmentId, io }) {
    const lead = await Lead.findOneAndUpdate(
      { _id: id, workspaceId, isArchived: { $ne: true } },
      { $pull: { attachments: { _id: attachmentId } } },
      { new: true, projection: { title: 1, attachments: 1, updatedAt: 1, statusId: 1, priority: 1, source: 1, value: 1 } },
    ).lean();
    if (!lead) return null;

    await appendActivity({
      workspaceId,
      module: 'leads',
      action: 'attachment_deleted',
      entity: 'lead',
      entityId: id,
      payload: { attachmentId },
    });
    await emitLeadMutation({ io, workspaceId, action: 'updated', lead });
    return { attachmentId };
  },
};
