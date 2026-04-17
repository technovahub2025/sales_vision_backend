import { Notification } from '../../models/notification.model.js';
import { emitDomainEvent } from '../../sockets/emitters.js';
import { userRoom } from '../../sockets/rooms.js';
import { appendActivity } from '../activity/activity.service.js';
import { Types } from 'mongoose';

/**
 * @param {string} cursor
 * @returns {{ createdAt: Date, id: Types.ObjectId } | null}
 */
function decodeCursor(cursor) {
  if (!cursor) return null;
  const [timestampValue, idValue] = String(cursor).split('_');
  const timestamp = Number(timestampValue);
  if (!Number.isFinite(timestamp) || !idValue || !Types.ObjectId.isValid(idValue)) {
    return null;
  }
  return {
    createdAt: new Date(timestamp),
    id: new Types.ObjectId(idValue),
  };
}

/**
 * @param {{ createdAt: Date, _id: Types.ObjectId | string }} notification
 * @returns {string}
 */
function encodeCursor(notification) {
  const createdAtMs = new Date(notification.createdAt).getTime();
  return `${createdAtMs}_${String(notification._id)}`;
}

/**
 * @param {unknown} value
 * @returns {boolean | undefined}
 */
function parseReadFilter(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return undefined;
}

function buildPayload(workspaceId, notification) {
  return {
    entityType: 'notification',
    entityId: String(notification._id),
    changeType: 'created',
    changedBy: null,
    timestamp: new Date().toISOString(),
    diff: null,
    workspaceId: String(workspaceId),
    data: notification,
  };
}

export const notificationsService = {
  async list({ workspaceId, userId, query = {} }) {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100);
    const cursor = decodeCursor(query.cursor);
    const where = { workspaceId, userId };
    const read = parseReadFilter(query.read ?? query.isRead);
    if (read !== undefined) {
      where.read = read;
    }
    if (query.type) {
      where.type = String(query.type);
    }
    if (cursor) {
      where.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
      ];
    }

    const [batch, unreadCount] = await Promise.all([
      Notification.find(
        where,
        { type: 1, title: 1, body: 1, entityType: 1, entityId: 1, read: 1, readAt: 1, createdAt: 1 },
      )
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1)
        .lean(),
      Notification.countDocuments({ workspaceId, userId, read: false }),
    ]);

    const hasMore = batch.length > limit;
    const items = hasMore ? batch.slice(0, limit) : batch;
    const lastItem = hasMore ? items[items.length - 1] : null;

    return {
      items,
      meta: {
        limit,
        unreadCount,
        hasMore,
        nextCursor: lastItem ? encodeCursor(lastItem) : null,
      },
    };
  },

  async create({ workspaceId, data, io }) {
    const created = await Notification.create({
      workspaceId,
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body || '',
      entityType: data.entityType || '',
      entityId: data.entityId || null,
      read: false,
      readAt: null,
    });
    const notification = created.toObject();
    await appendActivity({
      workspaceId,
      module: 'notifications',
      action: 'created',
      entity: 'notification',
      entityId: notification._id,
      payload: {
        userId: String(notification.userId),
        type: notification.type,
        entityType: notification.entityType,
        entityId: notification.entityId ? String(notification.entityId) : null,
      },
    });

    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'notifications',
      entity: 'notification',
      action: 'new',
      data: notification,
    });
    io.to(userRoom(String(data.userId))).emit('notification:new', buildPayload(workspaceId, notification));
    if (notification.type === 'mention') {
      io.to(userRoom(String(data.userId))).emit('notify:mention', buildPayload(workspaceId, notification));
    }

    return notification;
  },

  async markAllRead({ workspaceId, userId }) {
    const result = await Notification.updateMany(
      { workspaceId, userId, read: false },
      { $set: { read: true, readAt: new Date() } },
    );
    return { updated: result.modifiedCount || 0 };
  },

  async markRead({ workspaceId, userId, id }) {
    const now = new Date();
    const notification = await Notification.findOneAndUpdate(
      { workspaceId, userId, _id: id },
      { $set: { read: true, readAt: now } },
      { new: true, projection: { type: 1, title: 1, body: 1, entityType: 1, entityId: 1, read: 1, readAt: 1, createdAt: 1 } },
    ).lean();
    return notification;
  },

  async remove({ workspaceId, userId, id }) {
    return Notification.findOneAndDelete(
      { workspaceId, userId, _id: id },
      { projection: { _id: 1, read: 1 } },
    ).lean();
  },
};
