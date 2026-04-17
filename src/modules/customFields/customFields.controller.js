import { ok, fail } from '../../utils/apiResponse.js';
import { customFieldsService } from './customFields.service.js';

export const customFieldsController = {
  async list(req, res, next) {
    try {
      const { items, meta } = await customFieldsService.list({ workspaceId: req.workspaceId, query: req.query });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      return next(error);
    }
  },

  async create(req, res, next) {
    try {
      if (!req.body?.entityType || !req.body?.name || !req.body?.key || !req.body?.type) {
        return res.status(400).json(fail('entityType, name, key, type are required', 'VALIDATION_ERROR'));
      }
      const item = await customFieldsService.create({
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
      const item = await customFieldsService.update({
        workspaceId: req.workspaceId,
        id: req.params.id,
        data: req.body,
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Custom field not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },
};
