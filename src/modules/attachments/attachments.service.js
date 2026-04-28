import { Attachment } from '../../models/attachment.model.js';
import { Task } from '../../models/task.model.js';
import { Lead } from '../../models/lead.model.js';
import { Comment } from '../../models/comment.model.js';
import { Project } from '../../models/project.model.js';
import { Employee } from '../../models/employee.model.js';
import { User } from '../../models/user.model.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../../config/cloudinary.js';
import { appendActivity } from '../activity/activity.service.js';
import { emitDomainEvent, emitCoalesced } from '../../sockets/emitters.js';
import { invalidateDashboardCache } from '../dashboard/dashboard.service.js';
import { planLimitsService } from '../../services/planLimits.service.js';

const ENTITY_MODELS = {
  task: Task,
  lead: Lead,
  comment: Comment,
  project: Project,
  employee: Employee,
  user: User,
};

async function ensureEntityExists({ workspaceId, entityType, entityId }) {
  const Model = ENTITY_MODELS[entityType];
  if (!Model) return null;
  return Model.findOne({ _id: entityId, workspaceId }).select('_id projectId').lean();
}

function getCursorFilter(cursor) {
  if (!cursor) return {};
  return { _id: { $lt: cursor } };
}

async function emitAttachmentMutation({ io, workspaceId, entityType, entityId, action, payload, entity }) {
  if (!io) return;
  if (entityType === 'task') {
    emitDomainEvent(io, { workspaceId, moduleName: 'tasks', entity: 'task', action: 'updated', data: { _id: entityId } });
    if (entity?.projectId) {
      emitDomainEvent(io, { workspaceId, moduleName: 'board', entity: 'board', action: 'updated', data: { projectId: entity.projectId } });
    }
  }
  if (entityType === 'lead') {
    emitDomainEvent(io, { workspaceId, moduleName: 'leads', entity: 'lead', action: 'updated', data: { _id: entityId } });
  }
  if (entityType === 'comment') {
    emitDomainEvent(io, { workspaceId, moduleName: 'comments', entity: 'comment', action: 'updated', data: { _id: entityId } });
  }
  emitDomainEvent(io, { workspaceId, moduleName: 'activity', entity: 'activity', action: 'appended', data: { entity: entityType, action } });
  emitCoalesced(io, `dashboard:${workspaceId}`, () =>
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'dashboard',
      entity: 'dashboard',
      action: 'updated',
      data: { workspaceId },
    }),
  );
  await invalidateDashboardCache({ workspaceId, io, trigger: `${entityType}:attachment:${action}` });
}

export const attachmentsService = {
  async list({ workspaceId, entityType, entityId, query = {} }) {
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const cursor = query.cursor || null;
    const where = {
      workspaceId,
      entityType,
      entityId,
      ...getCursorFilter(cursor),
    };

    const items = await Attachment.find(where)
      .sort({ uploadedAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    const nextCursor = items.length === limit ? String(items[items.length - 1]._id) : null;
    return { items, meta: { limit, nextCursor } };
  },

  async uploadMany({ workspaceId, entityType, entityId, files = [], user, io }) {
    if (!files.length) return [];
    if (!user?._id) {
      throw new Error('userId is required');
    }
    const entity = await ensureEntityExists({ workspaceId, entityType, entityId });
    if (!entity) return null;

    const incomingBytes = (files || []).reduce((total, item) => total + Number(item?.size || 0), 0);
    const storageCheck = await planLimitsService.ensureStorageCapacity(workspaceId, incomingBytes);
    if (!storageCheck.allowed) {
      const error = new Error(storageCheck.message);
      error.statusCode = 429;
      error.code = storageCheck.code;
      error.details = storageCheck.details;
      throw error;
    }

    const created = [];
    for (const file of files) {
      const upload = await uploadToCloudinary(file.buffer, {
        filename: file.originalname,
        mimeType: file.mimetype,
        workspaceId,
        userId: user?._id,
        username: user?.displayName || user?.email || 'user',
        entityType,
        entityId,
      });

      const doc = await Attachment.create({
        workspaceId,
        entityType,
        entityId,
        url: upload.url,
        secureUrl: upload.secureUrl,
        publicId: upload.publicId,
        mimeType: file.mimetype,
        size: Number(file.size || upload.bytes || 0),
        originalName: file.originalname,
        uploadedBy: user?._id,
        uploadedAt: new Date(),
      });

      created.push(doc.toObject());
    }

    await appendActivity({
      workspaceId,
      module: entityType,
      action: 'attachment_created',
      entity: entityType,
      entityId,
      payload: { count: created.length },
    });

    await emitAttachmentMutation({
      io,
      workspaceId,
      entityType,
      entityId,
      action: 'attachment_created',
      payload: { count: created.length },
      entity,
    });

    return created;
  },

  async remove({ workspaceId, entityType, entityId, attachmentId, io }) {
    const attachment = await Attachment.findOne({ _id: attachmentId, workspaceId, entityType, entityId }).lean();
    if (!attachment) return null;

    await deleteFromCloudinary(attachment.publicId);
    await Attachment.deleteOne({ _id: attachmentId, workspaceId });

    await appendActivity({
      workspaceId,
      module: entityType,
      action: 'attachment_deleted',
      entity: entityType,
      entityId,
      payload: { attachmentId },
    });

    await emitAttachmentMutation({
      io,
      workspaceId,
      entityType,
      entityId,
      action: 'attachment_deleted',
      payload: { attachmentId },
    });

    return { attachmentId };
  },
};
