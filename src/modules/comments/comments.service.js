import { Comment } from '../../models/comment.model.js';
import { Task } from '../../models/task.model.js';
import { Lead } from '../../models/lead.model.js';
import { User } from '../../models/user.model.js';
import { appendActivity } from '../activity/activity.service.js';
import { emitDomainEvent } from '../../sockets/emitters.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { userRoom } from '../../sockets/rooms.js';

function parsePage(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}

function parseMentions(content = '') {
  const mentionRegex = /@([a-zA-Z0-9._-]+)/g;
  const names = new Set();
  let match = mentionRegex.exec(content);
  while (match) {
    names.add(match[1]);
    match = mentionRegex.exec(content);
  }
  return [...names];
}

function toLegacyShape(comment) {
  return {
    _id: comment._id,
    taskId: comment.entityType === 'task' ? comment.entityId : null,
    authorId: comment.authorId,
    type: 'comment',
    body: comment.content,
    createdAt: comment.createdAt,
    mentions: comment.mentions || [],
    attachments: comment.attachments || [],
    editedAt: comment.editedAt,
    isDeleted: comment.isDeleted,
  };
}

async function resolveMentionUsers({ workspaceId, names }) {
  if (!names.length) return [];
  const users = await User.find(
    { workspaceId, displayName: { $in: names } },
    { _id: 1, displayName: 1 },
  ).lean();
  return users.map((user) => ({ userId: user._id, name: user.displayName }));
}

export const commentsService = {
  async list({ workspaceId, query = {} }) {
    const { page, limit, skip } = parsePage(query);
    const entityType = query.entityType || (query.taskId ? 'task' : query.leadId ? 'lead' : 'task');
    const entityId = query.entityId || query.taskId || query.leadId;
    const where = { workspaceId, entityType, isDeleted: { $ne: true }, ...(entityId ? { entityId } : {}) };

    const [items, total] = await Promise.all([
      Comment.find(where, { entityType: 1, entityId: 1, authorId: 1, content: 1, mentions: 1, attachments: 1, editedAt: 1, createdAt: 1, isDeleted: 1 })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Comment.countDocuments(where),
    ]);

    return { items: items.map(toLegacyShape), meta: { page, limit, total } };
  },

  async getById({ workspaceId, id }) {
    const item = await Comment.findOne(
      { workspaceId, _id: id },
      { entityType: 1, entityId: 1, authorId: 1, content: 1, mentions: 1, attachments: 1, editedAt: 1, createdAt: 1, isDeleted: 1 },
    ).lean();
    return item ? toLegacyShape(item) : null;
  },

  async create({ workspaceId, data, io }) {
    const entityType = data?.entityType || (data?.taskId ? 'task' : data?.leadId ? 'lead' : 'task');
    const entityId = data?.entityId || data?.taskId || data?.leadId;
    if (!entityId) throw new Error('entityId is required');

    if (entityType === 'task') {
      const exists = await Task.findOne({ workspaceId, _id: entityId }, { _id: 1 }).lean();
      if (!exists) throw new Error('Task not found');
    } else {
      const exists = await Lead.findOne({ workspaceId, _id: entityId, isArchived: { $ne: true } }, { _id: 1 }).lean();
      if (!exists) throw new Error('Lead not found');
    }

    const content = String(data?.content || data?.body || '').trim();
    if (!content) throw new Error('content is required');

    const mentionNames = parseMentions(content);
    const mentionUsers = await resolveMentionUsers({ workspaceId, names: mentionNames });
    const created = await Comment.create({
      workspaceId,
      entityType,
      entityId,
      authorId: data?.authorId,
      content,
      mentions: mentionUsers,
      attachments: Array.isArray(data?.attachments) ? data.attachments : [],
    });
    const comment = created.toObject();

    if (entityType === 'task') {
      await Task.updateOne(
        { workspaceId, _id: entityId },
        { $inc: { commentsCount: 1, activityCount: 1 } },
      );
    }

    await appendActivity({
      workspaceId,
      module: 'comments',
      action: 'created',
      entity: entityType === 'task' ? 'task_comment' : 'lead_comment',
      entityId: comment._id,
      payload: { entityType, entityId, mentions: mentionUsers.map((m) => String(m.userId)) },
    });

    emitDomainEvent(io, { workspaceId, moduleName: 'comments', entity: 'comment', action: 'created', data: toLegacyShape(comment) });
    io.to(`workspace:${workspaceId}:module:comments:entity:${entityId}`).emit('comment:created', {
      workspaceId,
      entity: 'comment',
      action: 'created',
      data: toLegacyShape(comment),
      meta: { version: Date.now(), at: new Date().toISOString() },
    });

    for (const mention of mentionUsers) {
      const notification = await notificationsService.create({
        workspaceId,
        io,
        data: {
          userId: mention.userId,
          type: 'mention',
          title: 'You were mentioned in a comment',
          body: content.slice(0, 180),
          entityType,
          entityId,
        },
      });
      io.to(userRoom(String(mention.userId))).emit('notify:mention', {
        workspaceId,
        entity: 'notification',
        action: 'new',
        data: notification,
        meta: { version: Date.now(), at: new Date().toISOString() },
      });
    }

    return toLegacyShape(comment);
  },

  async update({ workspaceId, id, data, io }) {
    const previous = await Comment.findOne(
      { workspaceId, _id: id, isDeleted: { $ne: true } },
      { authorId: 1, createdAt: 1 },
    ).lean();
    if (!previous) return null;
    if (String(previous.authorId) !== String(data?.authorId || previous.authorId)) {
      throw new Error('Only author can edit comment');
    }
    const editWindowMs = 15 * 60 * 1000;
    if (Date.now() - new Date(previous.createdAt).getTime() > editWindowMs) {
      throw new Error('Edit window expired');
    }

    const updated = await Comment.findOneAndUpdate(
      { workspaceId, _id: id, isDeleted: { $ne: true } },
      { $set: { content: String(data?.content || data?.body || '').trim(), editedAt: new Date() } },
      { new: true, projection: { entityType: 1, entityId: 1, authorId: 1, content: 1, mentions: 1, attachments: 1, editedAt: 1, createdAt: 1, isDeleted: 1 } },
    ).lean();
    if (!updated) return null;

    await appendActivity({
      workspaceId,
      module: 'comments',
      action: 'updated',
      entity: 'comment',
      entityId: updated._id,
      payload: updated,
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'comments', entity: 'comment', action: 'updated', data: toLegacyShape(updated) });
    return toLegacyShape(updated);
  },

  async remove({ workspaceId, id, data = {}, io }) {
    const comment = await Comment.findOneAndUpdate(
      { workspaceId, _id: id, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, editedAt: new Date() } },
      { new: true, projection: { entityType: 1, entityId: 1, authorId: 1, content: 1, mentions: 1, attachments: 1, editedAt: 1, createdAt: 1, isDeleted: 1 } },
    ).lean();
    if (!comment) return null;

    if (comment.entityType === 'task') {
      await Task.updateOne(
        { workspaceId, _id: comment.entityId },
        { $inc: { commentsCount: -1, activityCount: 1 } },
      );
    }

    await appendActivity({
      workspaceId,
      module: 'comments',
      action: 'deleted',
      entity: 'comment',
      entityId: comment._id,
      payload: { actorId: data?.authorId || null },
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'comments', entity: 'comment', action: 'updated', data: toLegacyShape(comment) });
    return toLegacyShape(comment);
  },
};
