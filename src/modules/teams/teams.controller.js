import { ok, fail } from '../../utils/apiResponse.js';
import { teamsService } from './teams.service.js';

export const teamsController = {
  async list(req, res, next) {
    try {
      const { items, meta } = await teamsService.list({ workspaceId: req.workspaceId, query: req.query });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      return next(error);
    }
  },

  async create(req, res, next) {
    try {
      const data = await teamsService.create({
        workspaceId: req.workspaceId,
        data: req.body,
        actorId: req.user?._id || req.body?.actorId,
        io: req.app.locals.io,
      });
      return res.status(201).json(ok(data));
    } catch (error) {
      if (String(error?.message || '').includes('name is required')) {
        return res.status(400).json(fail('name is required', 'VALIDATION_ERROR'));
      }
      return next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const data = await teamsService.getById({ workspaceId: req.workspaceId, id: req.params.teamId });
      if (!data) return res.status(404).json(fail('Team not found', 'NOT_FOUND'));
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async update(req, res, next) {
    try {
      const data = await teamsService.update({
        workspaceId: req.workspaceId,
        id: req.params.teamId,
        data: req.body,
        actorId: req.user?._id || req.body?.actorId,
        io: req.app.locals.io,
      });
      if (!data) return res.status(404).json(fail('Team not found', 'NOT_FOUND'));
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async addMember(req, res, next) {
    try {
      if (!req.body?.userId) {
        return res.status(400).json(fail('userId is required', 'VALIDATION_ERROR'));
      }
      const data = await teamsService.addMember({
        workspaceId: req.workspaceId,
        id: req.params.teamId,
        userId: req.body.userId,
        actorId: req.user?._id || req.body?.actorId,
        io: req.app.locals.io,
      });
      if (!data) return res.status(404).json(fail('Team not found', 'NOT_FOUND'));
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async removeMember(req, res, next) {
    try {
      const data = await teamsService.removeMember({
        workspaceId: req.workspaceId,
        id: req.params.teamId,
        userId: req.params.userId,
        actorId: req.user?._id || req.body?.actorId,
        io: req.app.locals.io,
      });
      if (!data) return res.status(404).json(fail('Team not found', 'NOT_FOUND'));
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async workload(req, res, next) {
    try {
      const data = await teamsService.workload({
        workspaceId: req.workspaceId,
        id: req.params.teamId,
      });
      if (!data) return res.status(404).json(fail('Team not found', 'NOT_FOUND'));
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },
};
