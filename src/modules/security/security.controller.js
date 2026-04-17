import { ok, fail } from '../../utils/apiResponse.js';
import { securityService } from './security.service.js';

export const securityController = {
  async listSessions(req, res, next) {
    try {
      const { items, meta } = await securityService.listSessions({ workspaceId: req.workspaceId, query: req.query });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      return next(error);
    }
  },

  async createSession(req, res, next) {
    try {
      const session = await securityService.createSession({ workspaceId: req.workspaceId, data: req.body, io: req.app.locals.io });
      return res.status(201).json(ok(session));
    } catch (error) {
      return next(error);
    }
  },

  async updateSession(req, res, next) {
    try {
      const session = await securityService.updateSession({ workspaceId: req.workspaceId, id: req.params.id, data: req.body, io: req.app.locals.io });
      if (!session) return res.status(404).json(fail('Session not found', 'NOT_FOUND'));
      return res.status(200).json(ok(session));
    } catch (error) {
      return next(error);
    }
  },

  async listApiKeys(req, res, next) {
    try {
      const { items, meta } = await securityService.listApiKeys({ workspaceId: req.workspaceId, query: req.query });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      return next(error);
    }
  },

  async createApiKey(req, res, next) {
    try {
      const key = await securityService.createApiKey({ workspaceId: req.workspaceId, data: req.body, io: req.app.locals.io });
      return res.status(201).json(ok(key));
    } catch (error) {
      return next(error);
    }
  },

  async updateApiKey(req, res, next) {
    try {
      const key = await securityService.updateApiKey({ workspaceId: req.workspaceId, id: req.params.id, data: req.body, io: req.app.locals.io });
      if (!key) return res.status(404).json(fail('API key not found', 'NOT_FOUND'));
      return res.status(200).json(ok(key));
    } catch (error) {
      return next(error);
    }
  },

  async removeApiKey(req, res, next) {
    try {
      const key = await securityService.removeApiKey({ workspaceId: req.workspaceId, id: req.params.id, io: req.app.locals.io });
      if (!key) return res.status(404).json(fail('API key not found', 'NOT_FOUND'));
      return res.status(200).json(ok(key));
    } catch (error) {
      return next(error);
    }
  },
};
