import mongoose from 'mongoose';
import { Activity } from '../../models/activity.model.js';
import { getPagination } from '../../utils/pagination.js';

function toObjectId(value) {
  if (!value) return null;
  try {
    return new mongoose.Types.ObjectId(String(value));
  } catch {
    return null;
  }
}

function requireObjectId(value, label) {
  const parsed = toObjectId(value);
  if (!parsed) {
    const error = new Error(`Invalid ${label}`);
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  return parsed;
}

export const activityService = {
  async list({ workspaceId, query }) {
    const { page, limit, skip } = getPagination(query);
    const filter = { workspaceId };
    if (query.module) filter.module = query.module;
    if (query.entity) filter.entity = query.entity;
    if (query.action) filter.action = query.action;

    const [items, total] = await Promise.all([
      Activity.find(filter).sort('-occurredAt').skip(skip).limit(limit).lean(),
      Activity.countDocuments(filter),
    ]);

    return { items, meta: { page, limit, total, version: Date.now() } };
  },

  async feed({ workspaceId, query = {} }) {
    const workspaceObjectId = requireObjectId(workspaceId, 'workspaceId');
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const cursor = query.cursor || null;
    const filter = { workspaceId: workspaceObjectId };
    if (cursor) {
      filter._id = { $lt: requireObjectId(cursor, 'cursor') };
    }

    const items = await Activity.aggregate([
      { $match: filter },
      { $sort: { occurredAt: -1, _id: -1 } },
      { $limit: limit },
      {
        $addFields: {
          actorIdObj: {
            $convert: {
              input: '$payload.actorId',
              to: 'objectId',
              onError: null,
              onNull: null,
            },
          },
        },
      },
      {
        $lookup: {
          from: 'sv_users',
          localField: 'actorIdObj',
          foreignField: '_id',
          as: 'actorUser',
          pipeline: [{ $project: { displayName: 1, avatarUrl: 1 } }],
        },
      },
      {
        $project: {
          _id: 1,
          action: 1,
          entity: 1,
          entityId: 1,
          message: 1,
          occurredAt: 1,
          actor: {
            name: { $ifNull: [{ $first: '$actorUser.displayName' }, '$actor'] },
            avatarUrl: { $ifNull: [{ $first: '$actorUser.avatarUrl' }, ''] },
          },
        },
      },
    ]);

    const nextCursor = items.length === limit ? String(items[items.length - 1]._id) : null;
    return { items, meta: { limit, nextCursor } };
  },
};
