import mongoose from 'mongoose';
import { Campaign } from '../../models/campaign.model.js';
import { Lead } from '../../models/lead.model.js';
import { Client } from '../../models/client.model.js';
import { Activity } from '../../models/activity.model.js';
import { appendActivity } from '../activity/activity.service.js';
import { emitCoalesced, emitDomainEvent } from '../../sockets/emitters.js';

const STATUS_FLOW = {
  draft: new Set(['active']),
  active: new Set(['paused', 'completed']),
  paused: new Set(['active', 'completed']),
  completed: new Set([]),
};

function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  return error;
}

function toObjectId(value) {
  if (!value) return null;
  try {
    return new mongoose.Types.ObjectId(String(value));
  } catch {
    return null;
  }
}

function normalizeText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDate(value) {
  if (value === undefined) return undefined;
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeStatus(value, fallback = 'draft') {
  const status = normalizeText(value, fallback).toLowerCase();
  return STATUS_FLOW[status] ? status : fallback;
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => toObjectId(item)).filter(Boolean);
}

async function ensureWorkspaceLinks({ workspaceId, leadIds, clientIds }) {
  if (leadIds.length) {
    const count = await Lead.countDocuments({ workspaceId, _id: { $in: leadIds }, isArchived: { $ne: true } });
    if (count !== leadIds.length) {
      throw createValidationError('One or more leadIds are invalid for this workspace');
    }
  }
  if (clientIds.length) {
    const count = await Client.countDocuments({ workspaceId, _id: { $in: clientIds }, isArchived: { $ne: true } });
    if (count !== clientIds.length) {
      throw createValidationError('One or more clientIds are invalid for this workspace');
    }
  }
}

function ensureDateRange(startDate, endDate) {
  if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
    throw createValidationError('startDate must be before or equal to endDate');
  }
}

function parseListQuery(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function listSort(sort = 'newest') {
  const key = String(sort || 'newest').toLowerCase();
  if (key === 'oldest') return { updatedAt: 1, createdAt: 1, _id: 1 };
  if (key === 'start_date') return { startDate: -1, updatedAt: -1 };
  if (key === 'spend') return { spend: -1, updatedAt: -1 };
  if (key === 'conversion') return { conversionRate: -1, updatedAt: -1 };
  return { updatedAt: -1, createdAt: -1, _id: -1 };
}

function resolveArchiveFilter(query = {}) {
  const includeArchived = String(query.includeArchived || '').toLowerCase() === 'true';
  const onlyArchived = String(query.onlyArchived || '').toLowerCase() === 'true';
  if (onlyArchived) return { isArchived: true };
  if (includeArchived) return {};
  return { isArchived: { $ne: true } };
}

function buildListFilter(workspaceId, query = {}) {
  const where = { workspaceId, ...resolveArchiveFilter(query) };
  if (query.status) {
    where.status = normalizeStatus(query.status, 'draft');
  }
  if (query.search) {
    const escaped = String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    where.$or = [{ name: regex }, { channel: regex }, { owner: regex }, { lead: regex }];
  }
  return where;
}

function toPlainCampaign(campaign) {
  if (!campaign) return null;
  const leadCount = Array.isArray(campaign.leadIds) ? campaign.leadIds.length : 0;
  const clientCount = Array.isArray(campaign.clientIds) ? campaign.clientIds.length : 0;
  const conversionRate =
    campaign.conversionRate !== undefined && campaign.conversionRate !== null
      ? Number(campaign.conversionRate || 0)
      : leadCount > 0
        ? Number(((clientCount / leadCount) * 100).toFixed(1))
        : 0;

  const spend = Number(campaign.spend || 0);
  const roi =
    campaign.roi !== undefined && campaign.roi !== null
      ? Number(campaign.roi || 0)
      : spend > 0
        ? Number((Number(campaign.goalValue || 0) / spend).toFixed(2))
        : 0;

  return {
    ...campaign,
    conversionRate,
    roi,
    linkedLeadsCount: leadCount,
    linkedClientsCount: clientCount,
    lastActivityAt: campaign.lastActivityAt || campaign.updatedAt || campaign.createdAt || null,
  };
}

async function emitCampaignMutation({ io, workspaceId, action, campaign, payload = null }) {
  emitDomainEvent(io, {
    workspaceId,
    moduleName: 'campaigns',
    entity: 'campaign',
    action,
    data: campaign,
  });
  emitDomainEvent(io, {
    workspaceId,
    moduleName: 'activity',
    entity: 'activity',
    action: 'appended',
    data: { entity: 'campaign', action },
  });
  emitCoalesced(io, `dashboard:${workspaceId}`, () => {
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'dashboard',
      entity: 'dashboard',
      action: 'updated',
      data: { workspaceId },
    });
  });

  await appendActivity({
    workspaceId,
    module: 'campaigns',
    action,
    entity: 'campaign',
    entityId: campaign._id,
    payload: payload || campaign,
  });
}

function buildCreatePayload(workspaceId, data = {}) {
  const name = normalizeText(data.name, '');
  if (!name) throw createValidationError('name is required');

  const status = normalizeStatus(data.status, 'draft');
  const channel = normalizeText(data.channel, '');
  if (!channel) throw createValidationError('channel is required');
  const ownerId = toObjectId(data.ownerId);
  if (!ownerId) throw createValidationError('ownerId is required');
  const owner = normalizeText(data.owner, '');
  const lead = normalizeText(data.lead, '');
  const startDate = normalizeDate(data.startDate);
  if (!startDate) throw createValidationError('startDate is required');
  const endDate = normalizeDate(data.endDate);
  ensureDateRange(startDate, endDate);

  return {
    workspaceId,
    name,
    subtitle: normalizeText(data.subtitle, ''),
    status,
    channel,
    ownerId,
    owner,
    lead,
    progress: Math.max(0, Math.min(100, normalizeNumber(data.progress, 0))),
    performance: normalizeNumber(data.performance, 0),
    conversionRate: Math.max(0, normalizeNumber(data.conversionRate, 0)),
    budget: Math.max(0, normalizeNumber(data.budget, 0)),
    spend: Math.max(0, normalizeNumber(data.spend, 0)),
    roi: normalizeNumber(data.roi, 0),
    startDate: startDate || null,
    endDate: endDate || null,
    targetAudience: normalizeText(data.targetAudience, ''),
    goalType: normalizeText(data.goalType, ''),
    goalValue: normalizeNumber(data.goalValue, 0),
    utmSource: normalizeText(data.utmSource, ''),
    utmMedium: normalizeText(data.utmMedium, ''),
    utmCampaign: normalizeText(data.utmCampaign, ''),
    notes: normalizeText(data.notes, ''),
    leadIds: normalizeIdList(data.leadIds),
    clientIds: normalizeIdList(data.clientIds),
    lastActivityAt: new Date(),
    isArchived: false,
  };
}

async function buildUpdatePayload(workspaceId, data = {}, existing) {
  const payload = {};
  if (data.name !== undefined) {
    const name = normalizeText(data.name, '');
    if (!name) throw createValidationError('name is required');
    payload.name = name;
  }

  if (data.subtitle !== undefined) payload.subtitle = normalizeText(data.subtitle, '');
  if (data.channel !== undefined) payload.channel = normalizeText(data.channel, '');
  if (data.ownerId !== undefined) payload.ownerId = toObjectId(data.ownerId);
  if (data.owner !== undefined) payload.owner = normalizeText(data.owner, '');
  if (data.lead !== undefined) payload.lead = normalizeText(data.lead, '');
  if (data.progress !== undefined) payload.progress = Math.max(0, Math.min(100, normalizeNumber(data.progress, 0)));
  if (data.performance !== undefined) payload.performance = normalizeNumber(data.performance, 0);
  if (data.conversionRate !== undefined) payload.conversionRate = Math.max(0, normalizeNumber(data.conversionRate, 0));
  if (data.budget !== undefined) payload.budget = Math.max(0, normalizeNumber(data.budget, 0));
  if (data.spend !== undefined) payload.spend = Math.max(0, normalizeNumber(data.spend, 0));
  if (data.roi !== undefined) payload.roi = normalizeNumber(data.roi, 0);
  if (data.targetAudience !== undefined) payload.targetAudience = normalizeText(data.targetAudience, '');
  if (data.goalType !== undefined) payload.goalType = normalizeText(data.goalType, '');
  if (data.goalValue !== undefined) payload.goalValue = normalizeNumber(data.goalValue, 0);
  if (data.utmSource !== undefined) payload.utmSource = normalizeText(data.utmSource, '');
  if (data.utmMedium !== undefined) payload.utmMedium = normalizeText(data.utmMedium, '');
  if (data.utmCampaign !== undefined) payload.utmCampaign = normalizeText(data.utmCampaign, '');
  if (data.notes !== undefined) payload.notes = normalizeText(data.notes, '');
  if (data.startDate !== undefined) payload.startDate = normalizeDate(data.startDate);
  if (data.endDate !== undefined) payload.endDate = normalizeDate(data.endDate);
  if (data.leadIds !== undefined) payload.leadIds = normalizeIdList(data.leadIds);
  if (data.clientIds !== undefined) payload.clientIds = normalizeIdList(data.clientIds);

  if (data.status !== undefined) {
    payload.status = normalizeStatus(data.status, existing?.status || 'draft');
  }

  const nextStart = payload.startDate !== undefined ? payload.startDate : existing?.startDate || null;
  const nextEnd = payload.endDate !== undefined ? payload.endDate : existing?.endDate || null;
  ensureDateRange(nextStart, nextEnd);

  if (payload.leadIds || payload.clientIds) {
    await ensureWorkspaceLinks({
      workspaceId,
      leadIds: payload.leadIds || existing?.leadIds || [],
      clientIds: payload.clientIds || existing?.clientIds || [],
    });
  }

  payload.lastActivityAt = new Date();
  return payload;
}

export const campaignsService = {
  async list({ workspaceId, query = {} }) {
    const { page, limit, skip } = parseListQuery(query);
    const where = buildListFilter(workspaceId, query);
    const sort = listSort(query.sort);

    const [items, total] = await Promise.all([
      Campaign.find(where).sort(sort).skip(skip).limit(limit).lean(),
      Campaign.countDocuments(where),
    ]);

    return {
      items: items.map((item) => toPlainCampaign(item)),
      meta: { page, limit, total },
    };
  },

  async getById({ workspaceId, id }) {
    const campaign = await Campaign.findOne({ workspaceId, _id: id, isArchived: { $ne: true } }).lean();
    if (!campaign) return null;

    const [linkedLeads, linkedClients, timeline] = await Promise.all([
      campaign.leadIds?.length
        ? Lead.find(
            { workspaceId, _id: { $in: campaign.leadIds }, isArchived: { $ne: true } },
            { title: 1, statusId: 1, value: 1, priority: 1, source: 1, clientId: 1, updatedAt: 1 },
          ).lean()
        : Promise.resolve([]),
      campaign.clientIds?.length
        ? Client.find(
            { workspaceId, _id: { $in: campaign.clientIds }, isArchived: { $ne: true } },
            { name: 1, company: 1, email: 1, phone: 1, updatedAt: 1 },
          ).lean()
        : Promise.resolve([]),
      Activity.find(
        { workspaceId, entity: 'campaign', entityId: String(id) },
        { action: 1, message: 1, payload: 1, occurredAt: 1 },
      )
        .sort({ occurredAt: -1 })
        .limit(20)
        .lean(),
    ]);

    const plain = toPlainCampaign(campaign);
    return {
      ...plain,
      linkedLeads,
      linkedClients,
      timeline,
    };
  },

  async create({ workspaceId, data, io }) {
    const payload = buildCreatePayload(workspaceId, data);
    await ensureWorkspaceLinks({ workspaceId, leadIds: payload.leadIds, clientIds: payload.clientIds });

    const created = await Campaign.create(payload);
    const campaign = toPlainCampaign(await Campaign.findById(created._id).lean());

    await emitCampaignMutation({ io, workspaceId, action: 'created', campaign });
    return campaign;
  },

  async update({ workspaceId, id, data, io }) {
    const existing = await Campaign.findOne({ workspaceId, _id: id, isArchived: { $ne: true } }).lean();
    if (!existing) return null;

    const payload = await buildUpdatePayload(workspaceId, data, existing);

    const updated = await Campaign.findOneAndUpdate(
      { workspaceId, _id: id, isArchived: { $ne: true } },
      { $set: payload },
      { new: true },
    ).lean();
    if (!updated) return null;

    const campaign = toPlainCampaign(updated);
    await emitCampaignMutation({ io, workspaceId, action: 'updated', campaign, payload });
    return campaign;
  },

  async remove({ workspaceId, id, io }) {
    const removed = await Campaign.findOneAndUpdate(
      { workspaceId, _id: id, isArchived: { $ne: true } },
      { $set: { isArchived: true, lastActivityAt: new Date() } },
      { new: true },
    ).lean();
    if (!removed) return null;

    const campaign = toPlainCampaign(removed);
    await emitCampaignMutation({ io, workspaceId, action: 'deleted', campaign });
    return campaign;
  },

  async restore({ workspaceId, id, io }) {
    const restored = await Campaign.findOneAndUpdate(
      { workspaceId, _id: id, isArchived: true },
      { $set: { isArchived: false, lastActivityAt: new Date() } },
      { new: true },
    ).lean();
    if (!restored) return null;

    const campaign = toPlainCampaign(restored);
    await emitCampaignMutation({ io, workspaceId, action: 'updated', campaign, payload: { restored: true } });
    return campaign;
  },

  async duplicate({ workspaceId, id, io }) {
    const base = await Campaign.findOne({ workspaceId, _id: id, isArchived: { $ne: true } }).lean();
    if (!base) return null;

    const payload = {
      ...base,
      _id: undefined,
      id: undefined,
      name: `${base.name || 'Campaign'} (Copy)`,
      status: 'draft',
      progress: 0,
      spend: 0,
      performance: 0,
      lastActivityAt: new Date(),
      createdAt: undefined,
      updatedAt: undefined,
    };

    const created = await Campaign.create(payload);
    const campaign = toPlainCampaign(await Campaign.findById(created._id).lean());

    await emitCampaignMutation({ io, workspaceId, action: 'created', campaign, payload: { duplicateOf: id } });
    return campaign;
  },

  async transitionStatus({ workspaceId, id, status, io }) {
    const existing = await Campaign.findOne({ workspaceId, _id: id, isArchived: { $ne: true } }, { status: 1 }).lean();
    if (!existing) return null;

    const from = normalizeStatus(existing.status, 'draft');
    const to = normalizeStatus(status, from);
    if (from !== to && !STATUS_FLOW[from]?.has(to)) {
      throw createValidationError(`Invalid status transition: ${from} -> ${to}`);
    }

    const updated = await Campaign.findOneAndUpdate(
      { workspaceId, _id: id, isArchived: { $ne: true } },
      { $set: { status: to, lastActivityAt: new Date() } },
      { new: true },
    ).lean();
    if (!updated) return null;

    const campaign = toPlainCampaign(updated);
    await emitCampaignMutation({ io, workspaceId, action: 'status_changed', campaign, payload: { from, to } });
    return campaign;
  },

  async exportReport({ workspaceId, id, query = {} }) {
    if (id) {
      const campaign = await this.getById({ workspaceId, id });
      if (!campaign) return null;
      return {
        generatedAt: new Date().toISOString(),
        reportType: 'campaign',
        campaign,
      };
    }

    const items = await Campaign.find({ workspaceId, ...resolveArchiveFilter(query) }).sort({ updatedAt: -1 }).lean();
    const rows = items.map((item) => toPlainCampaign(item));

    return {
      generatedAt: new Date().toISOString(),
      reportType: 'campaigns',
      summary: {
        total: rows.length,
        active: rows.filter((row) => row.status === 'active').length,
        totalSpend: rows.reduce((sum, row) => sum + Number(row.spend || 0), 0),
        avgConversion: rows.length ? Number((rows.reduce((sum, row) => sum + Number(row.conversionRate || 0), 0) / rows.length).toFixed(1)) : 0,
      },
      items: rows,
    };
  },
};

