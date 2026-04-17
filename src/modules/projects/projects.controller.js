import { ok, fail } from '../../utils/apiResponse.js';
import { projectsService } from './projects.service.js';

export const projectsController = {
  async list(req, res, next) {
    try {
      const { items, meta } = await projectsService.list({ workspaceId: req.workspaceId, query: req.query });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      return next(error);
    }
  },

  async create(req, res, next) {
    try {
      if (!req.body?.name || !String(req.body.name).trim()) {
        return res.status(400).json(fail('name is required', 'VALIDATION_ERROR'));
      }
      const actorId = String(req.auth?.userId || '');
      if (!actorId) {
        return res.status(401).json(fail('Unauthorized', 'UNAUTHORIZED'));
      }

      const project = await projectsService.create({
        workspaceId: req.workspaceId,
        data: req.body,
        actorId,
        io: req.app.locals.io,
      });
      return res.status(201).json(ok(project));
    } catch (error) {
      const message = String(error?.message || '');
      if (message.includes('ownerId is required')) {
        return res.status(400).json(fail('ownerId is required', 'VALIDATION_ERROR'));
      }
      if (message.includes('Owner not found in workspace')) {
        return res.status(404).json(fail('Owner not found in workspace', 'NOT_FOUND'));
      }
      return next(error);
    }
  },

  async update(req, res, next) {
    try {
      const actorId = String(req.auth?.userId || '');
      if (!actorId) {
        return res.status(401).json(fail('Unauthorized', 'UNAUTHORIZED'));
      }

      if (!req.body?.name || !String(req.body.name).trim()) {
        return res.status(400).json(fail('name is required', 'VALIDATION_ERROR'));
      }

      const project = await projectsService.update({
        workspaceId: req.workspaceId,
        projectId: req.params.projectId,
        data: req.body,
        actorId,
        io: req.app.locals.io,
      });
      return res.status(200).json(ok(project));
    } catch (error) {
      const message = String(error?.message || '');
      if (message.includes('Project not found')) {
        return res.status(404).json(fail('Project not found', 'NOT_FOUND'));
      }
      if (message.includes('Owner not found in workspace')) {
        return res.status(404).json(fail('Owner not found in workspace', 'NOT_FOUND'));
      }
      return next(error);
    }
  },

  async delete(req, res, next) {
    try {
      const actorId = String(req.auth?.userId || '');
      if (!actorId) {
        return res.status(401).json(fail('Unauthorized', 'UNAUTHORIZED'));
      }

      const result = await projectsService.delete({
        workspaceId: req.workspaceId,
        projectId: req.params.projectId,
        actorId,
        io: req.app.locals.io,
      });
      return res.status(200).json(ok(result));
    } catch (error) {
      const message = String(error?.message || '');
      if (message.includes('Project not found')) {
        return res.status(404).json(fail('Project not found', 'NOT_FOUND'));
      }
      return next(error);
    }
  },

  async board(req, res, next) {
    try {
      const result = await projectsService.board({
        workspaceId: req.workspaceId,
        projectId: req.params.projectId,
      });
      if (!result.project) return res.status(404).json(fail('Project not found', 'NOT_FOUND'));
      return res.status(200).json(ok(result, { version: result.totals.version }));
    } catch (error) {
      return next(error);
    }
  },

  async overview(req, res, next) {
    try {
      const data = await projectsService.overview({
        workspaceId: req.workspaceId,
        projectId: req.params.projectId,
      });
      if (!data) return res.status(404).json(fail('Project not found', 'NOT_FOUND'));
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async members(req, res, next) {
    try {
      const data = await projectsService.listMembers({
        workspaceId: req.workspaceId,
        projectId: req.params.projectId,
      });
      if (!data) return res.status(404).json(fail('Project not found', 'NOT_FOUND'));
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async timeLogs(req, res, next) {
    try {
      const data = await projectsService.timeLogs({
        workspaceId: req.workspaceId,
        projectId: req.params.projectId,
        query: req.query,
      });
      if (!data) return res.status(404).json(fail('Project not found', 'NOT_FOUND'));
      return res.status(200).json(ok(data.items, data.meta));
    } catch (error) {
      return next(error);
    }
  },

  async addMember(req, res, next) {
    try {
      const userId = req.body?.userId;
      const role = req.body?.role || 'member';
      if (!userId) {
        return res.status(400).json(fail('userId is required', 'VALIDATION_ERROR'));
      }
      const data = await projectsService.addMember({
        workspaceId: req.workspaceId,
        projectId: req.params.projectId,
        userId,
        role,
        actorId: req.user?._id || req.body?.actorId,
        io: req.app.locals.io,
      });
      if (!data) return res.status(404).json(fail('Project not found', 'NOT_FOUND'));
      return res.status(201).json(ok(data));
    } catch (error) {
      if (String(error?.message || '').includes('User not found')) {
        return res.status(404).json(fail('User not found', 'NOT_FOUND'));
      }
      return next(error);
    }
  },

  async updateMemberRole(req, res, next) {
    try {
      if (!req.body?.role) {
        return res.status(400).json(fail('role is required', 'VALIDATION_ERROR'));
      }
      const data = await projectsService.updateMemberRole({
        workspaceId: req.workspaceId,
        projectId: req.params.projectId,
        userId: req.params.userId,
        role: req.body.role,
        actorId: req.user?._id || req.body?.actorId,
        io: req.app.locals.io,
      });
      if (!data) return res.status(404).json(fail('Member not found', 'NOT_FOUND'));
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async removeMember(req, res, next) {
    try {
      const data = await projectsService.removeMember({
        workspaceId: req.workspaceId,
        projectId: req.params.projectId,
        userId: req.params.userId,
        actorId: req.user?._id || req.body?.actorId,
        io: req.app.locals.io,
      });
      if (!data) return res.status(404).json(fail('Member not found', 'NOT_FOUND'));
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async updateView(req, res, next) {
    try {
      const result = await projectsService.updateBoardView({
        workspaceId: req.workspaceId,
        projectId: req.params.projectId,
        view: req.body,
        io: req.app.locals.io,
      });
      if (!result) return res.status(404).json(fail('Project not found', 'NOT_FOUND'));
      return res.status(200).json(ok(result, { version: result.version }));
    } catch (error) {
      return next(error);
    }
  },

  async createColumn(req, res, next) {
    try {
      const result = await projectsService.createBoardColumn({
        workspaceId: req.workspaceId,
        projectId: req.params.projectId,
        data: req.body,
        io: req.app.locals.io,
      });
      if (!result) return res.status(404).json(fail('Project not found', 'NOT_FOUND'));
      return res.status(201).json(ok(result, { version: result.version }));
    } catch (error) {
      if (String(error?.message || '').includes('title is required')) {
        return res.status(400).json(fail('title is required', 'VALIDATION_ERROR'));
      }
      return next(error);
    }
  },

  async updateColumn(req, res, next) {
    try {
      const result = await projectsService.updateBoardColumn({
        workspaceId: req.workspaceId,
        projectId: req.params.projectId,
        columnKey: req.params.columnKey,
        data: req.body,
        io: req.app.locals.io,
      });
      if (!result) return res.status(404).json(fail('Project not found', 'NOT_FOUND'));
      if (result.notFound) return res.status(404).json(fail('Column not found', 'NOT_FOUND'));
      return res.status(200).json(ok(result, { version: result.version }));
    } catch (error) {
      return next(error);
    }
  },

  async createTask(req, res, next) {
    try {
      if (!req.body?.title || !String(req.body.title).trim()) {
        return res.status(400).json(fail('title is required', 'VALIDATION_ERROR'));
      }
      const result = await projectsService.createBoardTask({
        workspaceId: req.workspaceId,
        projectId: req.params.projectId,
        data: req.body,
        io: req.app.locals.io,
      });
      if (!result) return res.status(404).json(fail('Project not found', 'NOT_FOUND'));
      return res.status(201).json(ok(result, { version: result.version }));
    } catch (error) {
      return next(error);
    }
  },

  async moveTask(req, res, next) {
    try {
      const toColumnKey = req.body?.toColumnKey;
      if (!toColumnKey) {
        return res.status(400).json(fail('toColumnKey is required', 'VALIDATION_ERROR'));
      }

      const result = await projectsService.moveBoardTask({
        workspaceId: req.workspaceId,
        projectId: req.params.projectId,
        taskId: req.params.taskId,
        toColumnKey,
        toPosition: req.body?.toPosition,
        io: req.app.locals.io,
      });
      if (!result) return res.status(404).json(fail('Project not found', 'NOT_FOUND'));
      if (!result.task) return res.status(404).json(fail('Task not found', 'NOT_FOUND'));
      return res.status(200).json(ok(result, { version: result.version }));
    } catch (error) {
      const message = String(error?.message || '');
      if (message.includes('Invalid target column')) {
        return res.status(400).json(fail('Invalid target column', 'VALIDATION_ERROR'));
      }
      if (
        message.includes('Invalid workflow transition') ||
        message.includes('Approval pending') ||
        message.includes('Blocked by open dependencies')
      ) {
        return res.status(409).json(fail(message, 'CONFLICT'));
      }
      return next(error);
    }
  },

  async deleteColumn(req, res, next) {
    try {
      const result = await projectsService.deleteBoardColumn({
        workspaceId: req.workspaceId,
        projectId: req.params.projectId,
        columnKey: req.params.columnKey,
        targetColumnKey: req.body?.targetColumnKey,
        io: req.app.locals.io,
      });
      if (!result) return res.status(404).json(fail('Project not found', 'NOT_FOUND'));
      if (result.notFound) return res.status(404).json(fail('Column not found', 'NOT_FOUND'));
      return res.status(200).json(ok(result, { version: result.version }));
    } catch (error) {
      const msg = String(error?.message || '');
      if (msg.includes('at least one column')) {
        return res.status(400).json(fail('Cannot delete the last column', 'VALIDATION_ERROR'));
      }
      if (msg.includes('No target column available')) {
        return res.status(400).json(fail('No target column available', 'VALIDATION_ERROR'));
      }
      return next(error);
    }
  },

  async deleteTask(req, res, next) {
    try {
      const result = await projectsService.deleteBoardTask({
        workspaceId: req.workspaceId,
        projectId: req.params.projectId,
        taskId: req.params.taskId,
        io: req.app.locals.io,
      });
      if (!result) return res.status(404).json(fail('Project not found', 'NOT_FOUND'));
      if (!result.task) return res.status(404).json(fail('Task not found', 'NOT_FOUND'));
      return res.status(200).json(ok(result, { version: result.version }));
    } catch (error) {
      return next(error);
    }
  },
};
