import { ok } from '../../utils/apiResponse.js';
import { activityService } from './activity.query.service.js';

export const activityController = {
  async list(req, res, next) {
    try {
      const { items, meta } = await activityService.list({ workspaceId: req.workspaceId, query: req.query });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      return next(error);
    }
  },

  async feed(req, res, next) {
    try {
      const { items, meta } = await activityService.feed({ workspaceId: req.workspaceId, query: req.query });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      return next(error);
    }
  },
};
