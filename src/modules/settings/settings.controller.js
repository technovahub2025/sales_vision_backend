import { ok } from '../../utils/apiResponse.js';
import { settingsService } from './settings.service.js';

export const settingsController = {
  async getProfile(req, res, next) {
    try {
      const profile = await settingsService.getProfile(req.workspaceId);
      return res.status(200).json(ok(profile || {}));
    } catch (error) {
      return next(error);
    }
  },

  async updateProfile(req, res, next) {
    try {
      const profile = await settingsService.updateProfile({ workspaceId: req.workspaceId, data: req.body, io: req.app.locals.io });
      return res.status(200).json(ok(profile));
    } catch (error) {
      return next(error);
    }
  },

  async getPreferences(req, res, next) {
    try {
      const preferences = await settingsService.getPreferences(req.workspaceId);
      return res.status(200).json(ok(preferences || {}));
    } catch (error) {
      return next(error);
    }
  },

  async updatePreferences(req, res, next) {
    try {
      const preferences = await settingsService.updatePreferences({ workspaceId: req.workspaceId, data: req.body, io: req.app.locals.io });
      return res.status(200).json(ok(preferences));
    } catch (error) {
      return next(error);
    }
  },

  async getWorkspace(req, res, next) {
    try {
      const workspace = await settingsService.getWorkspace(req.workspaceId);
      return res.status(200).json(ok(workspace || {}));
    } catch (error) {
      return next(error);
    }
  },

  async updateWorkspace(req, res, next) {
    try {
      const workspace = await settingsService.updateWorkspace({
        workspaceId: req.workspaceId,
        data: req.body,
        io: req.app.locals.io,
      });
      return res.status(200).json(ok(workspace));
    } catch (error) {
      return next(error);
    }
  },
};
