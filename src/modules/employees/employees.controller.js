import { ok, fail } from '../../utils/apiResponse.js';
import { employeesService } from './employees.service.js';

export const employeesController = {
  async list(req, res, next) {
    try {
      const { items, meta } = await employeesService.list({ workspaceId: req.workspaceId, query: req.query });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      return next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const item = await employeesService.getById({ workspaceId: req.workspaceId, id: req.params.id });
      if (!item) return res.status(404).json(fail('Employee not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async create(req, res, next) {
    try {
      const item = await employeesService.create({
        workspaceId: req.workspaceId,
        data: req.body,
        io: req.app.locals.io,
      });
      return res.status(201).json(ok(item));
    } catch (error) {
      if (String(error?.message || '').includes('name is required')) {
        return res.status(400).json(fail('name is required', 'VALIDATION_ERROR'));
      }
      return next(error);
    }
  },

  async update(req, res, next) {
    try {
      const item = await employeesService.update({
        workspaceId: req.workspaceId,
        id: req.params.id,
        data: req.body,
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Employee not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async remove(req, res, next) {
    try {
      const item = await employeesService.remove({
        workspaceId: req.workspaceId,
        id: req.params.id,
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Employee not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      return next(error);
    }
  },

  async timeline(req, res, next) {
    try {
      const { items, meta } = await employeesService.timeline({
        workspaceId: req.workspaceId,
        id: req.params.id,
        query: req.query,
      });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      return next(error);
    }
  },

  async employeeTimeLogs(req, res, next) {
    try {
      const data = await employeesService.employeeTimeLogs({
        workspaceId: req.workspaceId,
        id: req.params.id,
        query: req.query,
      });
      return res.status(200).json(ok(data.items, data.summary));
    } catch (error) {
      return next(error);
    }
  },

  async projectTimeLogs(req, res, next) {
    try {
      const data = await employeesService.projectTimeLogs({
        workspaceId: req.workspaceId,
        projectId: req.params.projectId,
        query: req.query,
      });
      return res.status(200).json(ok(data.items, data.meta));
    } catch (error) {
      return next(error);
    }
  },

  async myTimeSummary(req, res, next) {
    try {
      const employeeId = req.query.employeeId || req.user?._id;
      if (!employeeId) {
        return res.status(400).json(fail('employeeId is required', 'VALIDATION_ERROR'));
      }
      const data = await employeesService.myTimeSummary({
        workspaceId: req.workspaceId,
        employeeId,
        period: req.query.period || 'week',
      });
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async performance(req, res, next) {
    try {
      const data = await employeesService.performance({
        workspaceId: req.workspaceId,
        id: req.params.id,
        period: req.query.period || 'week',
      });
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },
};
