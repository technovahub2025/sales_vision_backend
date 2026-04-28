import { ok } from '../../utils/apiResponse.js';
import { superAdminService } from './superAdmin.service.js';

export const superAdminController = {
  async me(req, res, next) {
    try {
      const data = await superAdminService.me({ adminId: req.superAdmin.id });
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async summary(req, res, next) {
    try {
      const data = await superAdminService.summary();
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async dashboard(req, res, next) {
    try {
      const data = await superAdminService.dashboard();
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async listWorkspaces(req, res, next) {
    try {
      const data = await superAdminService.listWorkspaces({ query: req.query });
      return res.status(200).json(ok(data.items, data.meta));
    } catch (error) {
      return next(error);
    }
  },

  async listWorkspaceUsers(req, res, next) {
    try {
      const data = await superAdminService.listWorkspaceUsers({
        workspaceId: req.params.workspaceId,
        query: req.query,
      });
      return res.status(200).json(ok(data.items, data.meta));
    } catch (error) {
      return next(error);
    }
  },

  async listUsers(req, res, next) {
    try {
      const data = await superAdminService.listUsers({ query: req.query });
      return res.status(200).json(ok(data.items, data.meta));
    } catch (error) {
      return next(error);
    }
  },

  async workspaceHealth(req, res, next) {
    try {
      const data = await superAdminService.workspaceHealth({ query: req.query });
      return res.status(200).json(ok(data.items, data.meta));
    } catch (error) {
      return next(error);
    }
  },

  async activity(req, res, next) {
    try {
      const data = await superAdminService.activity({ query: req.query });
      return res.status(200).json(ok(data.items, data.meta));
    } catch (error) {
      return next(error);
    }
  },

  async security(req, res, next) {
    try {
      const data = await superAdminService.security({ query: req.query });
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async updateWorkspaceUserRole(req, res, next) {
    try {
      const data = await superAdminService.updateWorkspaceUserRole({
        workspaceId: req.params.workspaceId,
        userId: req.params.userId,
        role: req.body.role,
        io: req.app.locals.io,
      });
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async updateWorkspacePlan(req, res, next) {
    try {
      const data = await superAdminService.updateWorkspacePlan({
        workspaceId: req.params.workspaceId,
        plan: req.body.plan,
      });
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async removeWorkspaceUser(req, res, next) {
    try {
      const data = await superAdminService.removeWorkspaceUser({
        workspaceId: req.params.workspaceId,
        userId: req.params.userId,
        io: req.app.locals.io,
      });
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },

  async bulkRemoveWorkspaceUsers(req, res, next) {
    try {
      const data = await superAdminService.bulkRemoveWorkspaceUsers({
        users: req.body.users,
        io: req.app.locals.io,
      });
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },
};
