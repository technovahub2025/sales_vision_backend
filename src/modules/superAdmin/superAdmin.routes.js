import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.js';
import { requireSuperAdmin } from '../../middlewares/superAdminAuth.js';
import { superAdminController } from './superAdmin.controller.js';
import {
  bulkRemoveSuperAdminUsersSchema,
  listSuperAdminActivitySchema,
  listSuperAdminWorkspaceHealthSchema,
  listSuperAdminWorkspacesSchema,
  listSuperAdminUsersSchema,
  listWorkspaceUsersSchema,
  removeWorkspaceUserSchema,
  superAdminSecuritySchema,
  updateWorkspaceUserRoleSchema,
  updateWorkspacePlanSchema,
  workspaceUsersParamsSchema,
} from './superAdmin.validation.js';

export const superAdminRoutes = Router();

superAdminRoutes.use(requireSuperAdmin);

superAdminRoutes.get('/me', superAdminController.me);
superAdminRoutes.get('/summary', superAdminController.summary);
superAdminRoutes.get('/dashboard', superAdminController.dashboard);
superAdminRoutes.get('/workspaces', validateRequest(listSuperAdminWorkspacesSchema), superAdminController.listWorkspaces);
superAdminRoutes.get('/workspace-health', validateRequest(listSuperAdminWorkspaceHealthSchema), superAdminController.workspaceHealth);
superAdminRoutes.get('/activity', validateRequest(listSuperAdminActivitySchema), superAdminController.activity);
superAdminRoutes.get('/security', validateRequest(superAdminSecuritySchema), superAdminController.security);
superAdminRoutes.get('/users', validateRequest(listSuperAdminUsersSchema), superAdminController.listUsers);
superAdminRoutes.post(
  '/users/bulk-remove',
  validateRequest(bulkRemoveSuperAdminUsersSchema),
  superAdminController.bulkRemoveWorkspaceUsers,
);
superAdminRoutes.get(
  '/workspaces/:workspaceId/users',
  validateRequest(workspaceUsersParamsSchema),
  validateRequest(listWorkspaceUsersSchema),
  superAdminController.listWorkspaceUsers,
);
superAdminRoutes.delete(
  '/workspaces/:workspaceId/users/:userId',
  validateRequest(removeWorkspaceUserSchema),
  superAdminController.removeWorkspaceUser,
);
superAdminRoutes.patch(
  '/workspaces/:workspaceId/users/:userId/role',
  validateRequest(updateWorkspaceUserRoleSchema),
  superAdminController.updateWorkspaceUserRole,
);
superAdminRoutes.patch(
  '/workspaces/:workspaceId/plan',
  validateRequest(updateWorkspacePlanSchema),
  superAdminController.updateWorkspacePlan,
);
