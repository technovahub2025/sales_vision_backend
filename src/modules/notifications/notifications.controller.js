import { ok, fail } from '../../utils/apiResponse.js';
import { notificationsService } from './notifications.service.js';

export const notificationsController = {
  async list(req, res, next) {
    try {
      const userId = req.auth?.userId;
      if (!userId) {
        return res.status(401).json(fail('Unauthorized', 'UNAUTHORIZED'));
      }
      const { items, meta } = await notificationsService.list({
        workspaceId: req.workspaceId,
        userId,
        query: req.query,
      });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      return next(error);
    }
  },

  async markAllRead(req, res, next) {
    try {
      const userId = req.auth?.userId;
      if (!userId) {
        return res.status(401).json(fail('Unauthorized', 'UNAUTHORIZED'));
      }
      const data = await notificationsService.markAllRead({
        workspaceId: req.workspaceId,
        userId,
      });
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async markRead(req, res, next) {
    try {
      const userId = req.auth?.userId;
      if (!userId) {
        return res.status(401).json(fail('Unauthorized', 'UNAUTHORIZED'));
      }
      const data = await notificationsService.markRead({
        workspaceId: req.workspaceId,
        userId,
        id: req.params.id,
      });
      if (!data) return res.status(404).json(fail('Notification not found', 'NOT_FOUND'));
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async remove(req, res, next) {
    try {
      const userId = req.auth?.userId;
      if (!userId) {
        return res.status(401).json(fail('Unauthorized', 'UNAUTHORIZED'));
      }
      const data = await notificationsService.remove({
        workspaceId: req.workspaceId,
        userId,
        id: req.params.id,
      });
      if (!data) {
        return res.status(404).json(fail('Notification not found', 'NOT_FOUND'));
      }
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },
};
