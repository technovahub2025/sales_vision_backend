import { ok, fail } from '../utils/apiResponse.js';

export function createCrudController(service) {
  return {
    list: async (req, res, next) => {
      try {
        const { items, meta } = await service.list({ workspaceId: req.workspaceId, query: req.query });
        return res.status(200).json(ok(items, meta));
      } catch (error) {
        return next(error);
      }
    },

    getById: async (req, res, next) => {
      try {
        const item = await service.getById({ workspaceId: req.workspaceId, id: req.params.id });
        if (!item) {
          return res.status(404).json(fail('Item not found', 'NOT_FOUND'));
        }

        return res.status(200).json(ok(item));
      } catch (error) {
        return next(error);
      }
    },

    create: async (req, res, next) => {
      try {
        const item = await service.create({ workspaceId: req.workspaceId, data: req.body, io: req.app.locals.io });
        return res.status(201).json(ok(item));
      } catch (error) {
        return next(error);
      }
    },

    update: async (req, res, next) => {
      try {
        const item = await service.update({ workspaceId: req.workspaceId, id: req.params.id, data: req.body, io: req.app.locals.io });
        if (!item) {
          return res.status(404).json(fail('Item not found', 'NOT_FOUND'));
        }

        return res.status(200).json(ok(item));
      } catch (error) {
        return next(error);
      }
    },

    remove: async (req, res, next) => {
      try {
        const item = await service.remove({ workspaceId: req.workspaceId, id: req.params.id, io: req.app.locals.io });
        if (!item) {
          return res.status(404).json(fail('Item not found', 'NOT_FOUND'));
        }

        return res.status(200).json(ok(item));
      } catch (error) {
        return next(error);
      }
    },
  };
}
