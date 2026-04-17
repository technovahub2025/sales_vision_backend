import { ok, fail } from '../../utils/apiResponse.js';
import { leadsService } from './leads.service.js';
import { attachmentsService } from '../attachments/attachments.service.js';

export const leadsController = {
  async pipeline(req, res, next) {
    try {
      const data = await leadsService.pipeline({ workspaceId: req.workspaceId, query: req.query });
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async list(req, res, next) {
    try {
      const { items, meta } = await leadsService.list({ workspaceId: req.workspaceId, query: req.query });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      return next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const item = await leadsService.getById({ workspaceId: req.workspaceId, id: req.params.id });
      if (!item) return res.status(404).json(fail('Lead not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async create(req, res, next) {
    try {
      const item = await leadsService.create({ workspaceId: req.workspaceId, data: req.body, io: req.app.locals.io });
      return res.status(201).json(ok(item));
    } catch (error) {
      const message = String(error?.message || '');
      if (message.includes('title is required') || message.includes('Custom field')) {
        return res.status(400).json(fail(message, 'VALIDATION_ERROR'));
      }
      return next(error);
    }
  },

  async update(req, res, next) {
    try {
      const item = await leadsService.update({ workspaceId: req.workspaceId, id: req.params.id, data: req.body, io: req.app.locals.io });
      if (!item) return res.status(404).json(fail('Lead not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      const message = String(error?.message || '');
      if (message.includes('Custom field')) {
        return res.status(400).json(fail(message, 'VALIDATION_ERROR'));
      }
      return next(error);
    }
  },

  async move(req, res, next) {
    try {
      const statusId = req.body?.statusId;
      if (!statusId) return res.status(400).json(fail('statusId is required', 'VALIDATION_ERROR'));
      const item = await leadsService.transitionStatus({
        workspaceId: req.workspaceId,
        id: req.params.id,
        statusId,
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Lead not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async remove(req, res, next) {
    try {
      const item = await leadsService.remove({
        workspaceId: req.workspaceId,
        id: req.params.id,
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Lead not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async restore(req, res, next) {
    try {
      const item = await leadsService.restore({
        workspaceId: req.workspaceId,
        id: req.params.id,
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Lead not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async activity(req, res, next) {
    try {
      const { items, meta } = await leadsService.getActivity({ workspaceId: req.workspaceId, id: req.params.id, query: req.query });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      return next(error);
    }
  },

  async addNote(req, res, next) {
    try {
      const item = await leadsService.addNote({
        workspaceId: req.workspaceId,
        id: req.params.id,
        body: req.body?.body,
        actor: req.user?._id || 'workspace-actor',
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Lead not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      if (String(error?.message || '').includes('note is required')) {
        return res.status(400).json(fail('body is required', 'VALIDATION_ERROR'));
      }
      return next(error);
    }
  },

  async followUp(req, res, next) {
    try {
      const item = await leadsService.scheduleFollowUp({
        workspaceId: req.workspaceId,
        id: req.params.id,
        nextFollowUp: req.body?.nextFollowUp,
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Lead not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async addAttachment(req, res, next) {
    try {
      if (!req.files || !req.files.length) {
        return res.status(400).json(fail('files are required', 'VALIDATION_ERROR'));
      }
      const attachments = await attachmentsService.uploadMany({
        workspaceId: req.workspaceId,
        entityType: 'lead',
        entityId: req.params.id,
        files: req.files || [],
        user: req.user,
        io: req.app.locals.io,
      });
      if (!attachments) return res.status(404).json(fail('Lead not found', 'NOT_FOUND'));
      return res.status(201).json(ok(attachments));
    } catch (error) {
      return next(error);
    }
  },

  async removeAttachment(req, res, next) {
    try {
      const item = await attachmentsService.remove({
        workspaceId: req.workspaceId,
        entityType: 'lead',
        entityId: req.params.id,
        attachmentId: req.params.attachmentId,
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Lead not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async listAttachments(req, res, next) {
    try {
      const { items, meta } = await attachmentsService.list({
        workspaceId: req.workspaceId,
        entityType: 'lead',
        entityId: req.params.id,
        query: req.query,
      });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      return next(error);
    }
  },
};
