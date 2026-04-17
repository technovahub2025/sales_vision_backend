import { ok, fail } from '../../utils/apiResponse.js';
import { sprintsService } from './sprints.service.js';

export const sprintsController = {
  async listByProject(req, res, next) {
    try {
      const { items, meta } = await sprintsService.listByProject({
        workspaceId: req.workspaceId,
        projectId: req.params.projectId,
        query: req.query,
      });
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
      const item = await sprintsService.create({
        workspaceId: req.workspaceId,
        projectId: req.params.projectId,
        data: req.body,
        io: req.app.locals.io,
      });
      return res.status(201).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async start(req, res, next) {
    try {
      const item = await sprintsService.start({ workspaceId: req.workspaceId, id: req.params.id, io: req.app.locals.io });
      if (!item) return res.status(404).json(fail('Sprint not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async complete(req, res, next) {
    try {
      const action = req.body?.incompleteTaskAction;
      if (action) {
        const item = await sprintsService.completeWithAction({
          workspaceId: req.workspaceId,
          sprintId: req.params.id,
          action,
          nextSprintId: req.body?.nextSprintId,
          io: req.app.locals.io,
        });
        if (!item) return res.status(404).json(fail('Sprint not found', 'NOT_FOUND'));
        return res.status(200).json(ok(item));
      }
      const item = await sprintsService.complete({ workspaceId: req.workspaceId, id: req.params.id, io: req.app.locals.io });
      if (!item) return res.status(404).json(fail('Sprint not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async board(req, res, next) {
    try {
      const data = await sprintsService.board({ workspaceId: req.workspaceId, id: req.params.id });
      if (!data) return res.status(404).json(fail('Sprint not found', 'NOT_FOUND'));
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async burndown(req, res, next) {
    try {
      const data = await sprintsService.burndown({ workspaceId: req.workspaceId, id: req.params.id });
      if (!data) return res.status(404).json(fail('Sprint not found', 'NOT_FOUND'));
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async backlog(req, res, next) {
    try {
      const data = await sprintsService.backlog({ workspaceId: req.workspaceId, projectId: req.params.projectId });
      return res.status(200).json(ok(data, { total: data.length }));
    } catch (error) {
      return next(error);
    }
  },

  async listSprintItems(req, res, next) {
    try {
      const data = await sprintsService.listSprintItems({ workspaceId: req.workspaceId, sprintId: req.params.id });
      return res.status(200).json(ok(data, { total: data.length }));
    } catch (error) {
      return next(error);
    }
  },

  async reorderSprintItems(req, res, next) {
    try {
      const data = await sprintsService.reorderSprintItems({
        workspaceId: req.workspaceId,
        sprintId: req.params.id,
        orderedTaskIds: req.body?.orderedTaskIds,
        io: req.app.locals.io,
      });
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async addSprintItem(req, res, next) {
    try {
      const data = await sprintsService.addSprintItem({
        workspaceId: req.workspaceId,
        sprintId: req.params.id,
        taskId: req.body?.taskId,
        position: req.body?.position,
        io: req.app.locals.io,
      });
      if (!data) return res.status(404).json(fail('Sprint not found', 'NOT_FOUND'));
      if (data.task === null) return res.status(404).json(fail('Task not found', 'NOT_FOUND'));
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async incompleteTasks(req, res, next) {
    try {
      const data = await sprintsService.incompleteTasks({ workspaceId: req.workspaceId, sprintId: req.params.id });
      return res.status(200).json(ok(data, { total: data.length }));
    } catch (error) {
      return next(error);
    }
  },

  async setBacklogOrder(req, res, next) {
    try {
      const item = await sprintsService.setBacklogOrder({
        workspaceId: req.workspaceId,
        taskId: req.params.taskId,
        backlogOrder: req.body?.backlogOrder,
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Task not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async addBacklogTasks(req, res, next) {
    try {
      if (!Array.isArray(req.body?.taskIds) || !req.body.taskIds.length) {
        return res.status(400).json(fail('taskIds is required', 'VALIDATION_ERROR'));
      }
      const data = await sprintsService.moveBacklogTasksToSprint({
        workspaceId: req.workspaceId,
        sprintId: req.params.id,
        taskIds: req.body?.taskIds,
        io: req.app.locals.io,
      });
      if (!data) return res.status(404).json(fail('Sprint not found', 'NOT_FOUND'));
      return res.status(200).json(ok(data));
    } catch (error) {
      const message = String(error?.message || '');
      if (message.includes('taskIds is required') || message.includes('do not belong to this sprint project')) {
        return res.status(400).json(fail(message, 'VALIDATION_ERROR'));
      }
      if (message.includes('were not found')) {
        return res.status(404).json(fail(message, 'NOT_FOUND'));
      }
      return next(error);
    }
  },
};
