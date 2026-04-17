import { ok, fail } from '../../utils/apiResponse.js';
import { clientsService } from './clients.service.js';

export const clientsController = {
  async list(req, res, next) {
    try {
      const { items, meta } = await clientsService.list({ workspaceId: req.workspaceId, query: req.query });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      return next(error);
    }
  },

  async create(req, res, next) {
    try {
      const item = await clientsService.create({ workspaceId: req.workspaceId, data: req.body, io: req.app.locals.io });
      return res.status(201).json(ok(item));
    } catch (error) {
      if (String(error?.message || '').includes('name is required')) {
        return res.status(400).json(fail('name is required', 'VALIDATION_ERROR'));
      }
      return next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const item = await clientsService.getById({ workspaceId: req.workspaceId, id: req.params.id });
      if (!item) return res.status(404).json(fail('Client not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async update(req, res, next) {
    try {
      const item = await clientsService.update({
        workspaceId: req.workspaceId,
        id: req.params.id,
        data: req.body,
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Client not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async leads(req, res, next) {
    try {
      const items = await clientsService.clientLeads({ workspaceId: req.workspaceId, id: req.params.id });
      return res.status(200).json(ok(items));
    } catch (error) {
      return next(error);
    }
  },

  async projects(req, res, next) {
    try {
      const items = await clientsService.clientProjects({ workspaceId: req.workspaceId, id: req.params.id });
      return res.status(200).json(ok(items));
    } catch (error) {
      return next(error);
    }
  },

  async addNote(req, res, next) {
    try {
      const item = await clientsService.addNote({
        workspaceId: req.workspaceId,
        id: req.params.id,
        body: req.body?.body,
        actor: req.user?._id || 'workspace-actor',
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Client not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      if (String(error?.message || '').includes('note is required')) {
        return res.status(400).json(fail('body is required', 'VALIDATION_ERROR'));
      }
      return next(error);
    }
  },

  async remove(req, res, next) {
    try {
      const item = await clientsService.remove({
        workspaceId: req.workspaceId,
        id: req.params.id,
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Client not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async restore(req, res, next) {
    try {
      const item = await clientsService.restore({
        workspaceId: req.workspaceId,
        id: req.params.id,
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Client not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },
};
