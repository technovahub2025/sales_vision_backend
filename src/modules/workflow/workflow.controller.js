import { ok, fail } from '../../utils/apiResponse.js';
import { workflowService } from './workflow.service.js';

export const workflowController = {
  async list(req, res, next) {
    try {
      const { items, meta } = await workflowService.listWorkflows({
        workspaceId: req.workspaceId,
        entityType: req.query?.entityType || 'task',
      });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      return next(error);
    }
  },

  async create(req, res, next) {
    try {
      const item = await workflowService.createWorkflow({
        workspaceId: req.workspaceId,
        data: req.body,
        io: req.app.locals.io,
      });
      return res.status(201).json(ok(item));
    } catch (error) {
      const message = String(error?.message || '');
      if (message.includes('name is required')) {
        return res.status(400).json(fail('name is required', 'VALIDATION_ERROR'));
      }
      if (message.includes('duplicate key')) {
        return res.status(409).json(fail('Workflow name already exists', 'CONFLICT'));
      }
      return next(error);
    }
  },

  async listStatuses(req, res, next) {
    try {
      const { items, meta } = await workflowService.listStatuses({
        workspaceId: req.workspaceId,
        workflowId: req.params.workflowId,
      });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      if (String(error?.message || '').includes('invalid workflowId')) {
        return res.status(400).json(fail('invalid workflowId', 'VALIDATION_ERROR'));
      }
      return next(error);
    }
  },

  async createStatus(req, res, next) {
    try {
      const item = await workflowService.createStatus({
        workspaceId: req.workspaceId,
        workflowId: req.params.workflowId,
        data: req.body,
        io: req.app.locals.io,
      });
      return res.status(201).json(ok(item));
    } catch (error) {
      const message = String(error?.message || '');
      if (
        message.includes('invalid workflowId') ||
        message.includes('key and name are required')
      ) {
        return res.status(400).json(fail(message, 'VALIDATION_ERROR'));
      }
      if (message.includes('duplicate key')) {
        return res.status(409).json(fail('Status key already exists in workflow', 'CONFLICT'));
      }
      return next(error);
    }
  },

  async updateStatus(req, res, next) {
    try {
      const item = await workflowService.updateStatus({
        workspaceId: req.workspaceId,
        workflowId: req.params.workflowId,
        statusId: req.params.statusId,
        data: req.body,
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Workflow status not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      const message = String(error?.message || '');
      if (
        message.includes('invalid workflow/status id') ||
        message.includes('no fields to update')
      ) {
        return res.status(400).json(fail(message, 'VALIDATION_ERROR'));
      }
      if (message.includes('duplicate key')) {
        return res.status(409).json(fail('Status key already exists in workflow', 'CONFLICT'));
      }
      return next(error);
    }
  },

  async listTransitions(req, res, next) {
    try {
      const { items, meta } = await workflowService.listTransitions({
        workspaceId: req.workspaceId,
        workflowId: req.params.workflowId,
      });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      if (String(error?.message || '').includes('invalid workflowId')) {
        return res.status(400).json(fail('invalid workflowId', 'VALIDATION_ERROR'));
      }
      return next(error);
    }
  },

  async createTransition(req, res, next) {
    try {
      const item = await workflowService.createTransition({
        workspaceId: req.workspaceId,
        workflowId: req.params.workflowId,
        data: req.body,
        io: req.app.locals.io,
      });
      return res.status(201).json(ok(item));
    } catch (error) {
      const message = String(error?.message || '');
      if (message.includes('fromStatusId and toStatusId are required') || message.includes('invalid workflow/transition id')) {
        return res.status(400).json(fail(message, 'VALIDATION_ERROR'));
      }
      if (message.includes('duplicate key')) {
        return res.status(409).json(fail('Transition already exists', 'CONFLICT'));
      }
      return next(error);
    }
  },

  async removeTransition(req, res, next) {
    try {
      const item = await workflowService.removeTransition({
        workspaceId: req.workspaceId,
        workflowId: req.params.workflowId,
        transitionId: req.params.transitionId,
        io: req.app.locals.io,
      });
      if (!item) return res.status(404).json(fail('Transition not found', 'NOT_FOUND'));
      return res.status(200).json(ok(item));
    } catch (error) {
      if (String(error?.message || '').includes('invalid workflow/transition id')) {
        return res.status(400).json(fail('invalid workflow/transition id', 'VALIDATION_ERROR'));
      }
      return next(error);
    }
  },

  async ensureDefaultTaskWorkflow(req, res, next) {
    try {
      const data = await workflowService.ensureDefaultTaskWorkflow(req.workspaceId);
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },
};
