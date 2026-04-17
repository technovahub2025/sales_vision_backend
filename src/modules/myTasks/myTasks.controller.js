import { ok, fail } from '../../utils/apiResponse.js';
import { myTasksService } from './myTasks.service.js';

function resolveUserId(req) {
  return req.auth?.userId || req.user?._id || req.headers['x-user-id'] || req.query?.userId || req.body?.userId || null;
}

export const myTasksController = {
  async list(req, res, next) {
    try {
      const userId = resolveUserId(req);
      if (!userId) {
        return res.status(400).json(fail('userId is required', 'VALIDATION_ERROR'));
      }

      const { groups, items, meta } = await myTasksService.list({
        workspaceId: req.workspaceId,
        userId,
        query: req.query,
      });
      const openCount = await myTasksService.openCount({ workspaceId: req.workspaceId, userId });
      return res.status(200).json(ok({ groups, items }, { ...meta, openCount }));
    } catch (error) {
      return next(error);
    }
  },

  async patch(req, res, next) {
    try {
      const userId = resolveUserId(req);
      if (!userId) {
        return res.status(400).json(fail('userId is required', 'VALIDATION_ERROR'));
      }

      const task = await myTasksService.patchTask({
        workspaceId: req.workspaceId,
        userId,
        taskId: req.params.taskId,
        data: req.body,
        io: req.app.locals.io,
      });

      if (!task) {
        return res.status(404).json(fail('Task not found', 'NOT_FOUND'));
      }
      if (task.forbidden) {
        return res.status(403).json(fail('Only assignee can update this task', 'FORBIDDEN'));
      }
      return res.status(200).json(ok(task));
    } catch (error) {
      if (String(error?.message || '').includes('Invalid workflow transition')) {
        return res.status(409).json(fail('Invalid workflow transition', 'CONFLICT'));
      }
      return next(error);
    }
  },

  async quickCreate(req, res, next) {
    try {
      const userId = resolveUserId(req);
      if (!userId) {
        return res.status(400).json(fail('userId is required', 'VALIDATION_ERROR'));
      }

      const task = await myTasksService.quickCreate({
        workspaceId: req.workspaceId,
        userId,
        data: req.body,
        io: req.app.locals.io,
      });
      if (!task) {
        return res.status(400).json(fail('Unable to create task', 'VALIDATION_ERROR'));
      }
      return res.status(201).json(ok(task));
    } catch (error) {
      if (String(error?.message || '').includes('projectId is required')) {
        return res.status(400).json(fail('projectId is required', 'VALIDATION_ERROR'));
      }
      return next(error);
    }
  },

  async reorder(req, res, next) {
    try {
      const userId = resolveUserId(req);
      if (!userId) {
        return res.status(400).json(fail('userId is required', 'VALIDATION_ERROR'));
      }
      const result = await myTasksService.reorder({
        workspaceId: req.workspaceId,
        userId,
        taskId: req.body?.taskId,
        newPosition: req.body?.newPosition,
        groupKey: req.body?.groupKey,
        io: req.app.locals.io,
      });
      return res.status(200).json(ok(result));
    } catch (error) {
      return next(error);
    }
  },
};
