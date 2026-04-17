import { createCrudController } from '../createCrudController.js';
import { commentsService } from './comments.service.js';
import { attachmentsService } from '../attachments/attachments.service.js';
import { ok, fail } from '../../utils/apiResponse.js';

export const commentsController = createCrudController(commentsService);

commentsController.create = async (req, res, next) => {
  try {
    const comment = await commentsService.create({
      workspaceId: req.workspaceId,
      data: { ...req.body, authorId: req.auth.userId },
      io: req.app.locals.io,
    });
    return res.status(201).json(ok(comment));
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('content is required') || message.includes('entityId is required')) {
      return res.status(400).json(fail(message, 'VALIDATION_ERROR'));
    }
    if (message.includes('Task not found') || message.includes('Lead not found')) {
      return res.status(404).json(fail(message, 'NOT_FOUND'));
    }
    return next(error);
  }
};

commentsController.listByTask = async (req, res, next) => {
  try {
    const { items, meta } = await commentsService.list({
      workspaceId: req.workspaceId,
      query: { ...req.query, taskId: req.params.taskId },
    });
    return res.status(200).json(ok(items, meta));
  } catch (error) {
    return next(error);
  }
};

commentsController.listByLead = async (req, res, next) => {
  try {
    const { items, meta } = await commentsService.list({
      workspaceId: req.workspaceId,
      query: { ...req.query, entityType: 'lead', leadId: req.params.leadId },
    });
    return res.status(200).json(ok(items, meta));
  } catch (error) {
    return next(error);
  }
};

commentsController.createForTask = async (req, res, next) => {
  try {
    const comment = await commentsService.create({
      workspaceId: req.workspaceId,
      data: { ...req.body, taskId: req.params.taskId, authorId: req.auth.userId },
      io: req.app.locals.io,
    });
    return res.status(201).json(ok(comment));
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('content is required') || message.includes('entityId is required')) {
      return res.status(400).json(fail(message, 'VALIDATION_ERROR'));
    }
    if (message.includes('Task not found') || message.includes('Lead not found')) {
      return res.status(404).json(fail(message, 'NOT_FOUND'));
    }
    return next(error);
  }
};

commentsController.createForLead = async (req, res, next) => {
  try {
    const comment = await commentsService.create({
      workspaceId: req.workspaceId,
      data: {
        ...req.body,
        leadId: req.params.leadId,
        entityType: 'lead',
        entityId: req.params.leadId,
        authorId: req.auth.userId,
      },
      io: req.app.locals.io,
    });
    return res.status(201).json(ok(comment));
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('content is required') || message.includes('entityId is required')) {
      return res.status(400).json(fail(message, 'VALIDATION_ERROR'));
    }
    if (message.includes('Lead not found')) {
      return res.status(404).json(fail(message, 'NOT_FOUND'));
    }
    return next(error);
  }
};

commentsController.addAttachment = async (req, res, next) => {
  try {
    if (!req.files || !req.files.length) {
      return res.status(400).json(fail('files are required', 'VALIDATION_ERROR'));
    }
    const attachments = await attachmentsService.uploadMany({
      workspaceId: req.workspaceId,
      entityType: 'comment',
      entityId: req.params.commentId,
      files: req.files || [],
      user: req.user,
      io: req.app.locals.io,
    });
    if (!attachments) return res.status(404).json(fail('Comment not found', 'NOT_FOUND'));
    return res.status(201).json(ok(attachments));
  } catch (error) {
    return next(error);
  }
};

commentsController.removeAttachment = async (req, res, next) => {
  try {
    const item = await attachmentsService.remove({
      workspaceId: req.workspaceId,
      entityType: 'comment',
      entityId: req.params.commentId,
      attachmentId: req.params.attachmentId,
      io: req.app.locals.io,
    });
    if (!item) return res.status(404).json(fail('Attachment not found', 'NOT_FOUND'));
    return res.status(200).json(ok(item));
  } catch (error) {
    return next(error);
  }
};
