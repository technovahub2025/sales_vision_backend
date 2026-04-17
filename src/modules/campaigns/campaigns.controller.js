import { ok, fail } from '../../utils/apiResponse.js';
import { campaignsService } from './campaigns.service.js';

export const campaignsController = {
  async list(req, res, next) {
    try {
      const { items, meta } = await campaignsService.list({ workspaceId: req.workspaceId, query: req.query });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      return next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const item = await campaignsService.getById({ workspaceId: req.workspaceId, id: req.params.id });
      if (!item) return res.status(404).json(fail('Campaign not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async create(req, res, next) {
    try {
      const item = await campaignsService.create({
        workspaceId: req.workspaceId,
        data: req.body,
        io: req.app.locals.io,
      });
      return res.status(201).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async update(req, res, next) {
    try {
      const item = await campaignsService.update({
        workspaceId: req.workspaceId,
        id: req.params.id,
        data: req.body,
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Campaign not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async remove(req, res, next) {
    try {
      const item = await campaignsService.remove({
        workspaceId: req.workspaceId,
        id: req.params.id,
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Campaign not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async restore(req, res, next) {
    try {
      const item = await campaignsService.restore({
        workspaceId: req.workspaceId,
        id: req.params.id,
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Campaign not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async duplicate(req, res, next) {
    try {
      const item = await campaignsService.duplicate({
        workspaceId: req.workspaceId,
        id: req.params.id,
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Campaign not found', 'NOT_FOUND'));
      return res.status(201).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async transitionStatus(req, res, next) {
    try {
      const status = String(req.body?.status || '').trim().toLowerCase();
      if (!status) {
        return res.status(400).json(fail('status is required', 'VALIDATION_ERROR'));
      }
      const item = await campaignsService.transitionStatus({
        workspaceId: req.workspaceId,
        id: req.params.id,
        status,
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Campaign not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async exportReport(req, res, next) {
    try {
      const report = await campaignsService.exportReport({
        workspaceId: req.workspaceId,
        id: req.params.id || null,
        query: req.query,
      });
      if (!report) return res.status(404).json(fail('Campaign not found', 'NOT_FOUND'));
      return res.status(200).json(ok(report));
    } catch (error) {
      return next(error);
    }
  },
};

