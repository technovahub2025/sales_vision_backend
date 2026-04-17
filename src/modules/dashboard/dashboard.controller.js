import { ok, fail } from '../../utils/apiResponse.js';
import { dashboardService } from './dashboard.service.js';

export const dashboardController = {
  async get(req, res, next) {
    try {
      const view = req.query?.view === 'personal' ? 'personal' : 'workspace';
      const userId = req.user?._id || req.headers['x-user-id'] || req.query?.userId || null;
      if (view === 'personal' && !userId) {
        return res.status(400).json(fail('userId is required for personal dashboard view', 'VALIDATION_ERROR'));
      }
      const data = await dashboardService.get({ workspaceId: req.workspaceId, view, userId });
      return res.status(200).json(ok(data, { version: data.version, generatedAt: data.generatedAt, cacheHit: Boolean(data.cacheHit), view }));
    } catch (error) {
      return next(error);
    }
  },

  async exportReport(req, res, next) {
    try {
      const data = await dashboardService.exportReport({
        workspaceId: req.workspaceId,
        format: req.body?.format || 'pdf',
        io: req.app.locals.io,
      });
      return res.status(200).json(ok(data, { version: Date.now(), generatedAt: data.generatedAt }));
    } catch (error) {
      return next(error);
    }
  },

  async strategyMeeting(req, res, next) {
    try {
      const data = await dashboardService.strategyMeeting({
        workspaceId: req.workspaceId,
        io: req.app.locals.io,
      });
      return res.status(200).json(ok(data, { version: Date.now(), generatedAt: data.createdAt }));
    } catch (error) {
      return next(error);
    }
  },
};
