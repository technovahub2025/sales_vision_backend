import { ok, fail } from '../../utils/apiResponse.js';
import { labelsService } from './labels.service.js';

export const labelsController = {
  async list(req, res, next) {
    try {
      const { items, meta } = await labelsService.list({ workspaceId: req.workspaceId });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      return next(error);
    }
  },

  async create(req, res, next) {
    try {
      if (!req.body?.name) {
        return res.status(400).json(fail('name is required', 'VALIDATION_ERROR'));
      }
      const item = await labelsService.create({
        workspaceId: req.workspaceId,
        data: req.body,
        io: req.app.locals.io,
      });
      return res.status(201).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async remove(req, res, next) {
    try {
      const item = await labelsService.remove({
        workspaceId: req.workspaceId,
        id: req.params.id,
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Label not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },
};
