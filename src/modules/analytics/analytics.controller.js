import { createCrudController } from '../createCrudController.js';
import { analyticsService } from './analytics.service.js';
import { ok } from '../../utils/apiResponse.js';

const crud = createCrudController(analyticsService);

export const analyticsController = {
  ...crud,
  async overview(req, res, next) {
    try {
      const data = await analyticsService.overview(req.workspaceId, req.query, { userId: req.auth?.userId });
      return res.status(200).json(ok(data, { generatedAt: data.generatedAt, cacheHit: Boolean(data.cacheHit) }));
    } catch (error) {
      return next(error);
    }
  },
  async projectHealth(req, res, next) {
    try {
      const data = await analyticsService.projectHealth(req.workspaceId, req.query);
      return res.status(200).json(ok(data, { generatedAt: new Date().toISOString() }));
    } catch (error) {
      return next(error);
    }
  },
  async exportReport(req, res, next) {
    try {
      const payload = await analyticsService.exportAnalytics({
        workspaceId: req.workspaceId,
        query: req.query,
        role: req.membership?.role || req.auth?.role,
        userId: req.auth?.userId,
      });
      res.setHeader('Content-Type', payload.contentType);
      res.setHeader('Content-Disposition', `attachment; filename=\"${payload.filename}\"`);
      return res.status(200).send(payload.body);
    } catch (error) {
      return next(error);
    }
  },
};
