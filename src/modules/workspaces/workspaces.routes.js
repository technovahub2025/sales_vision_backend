import { Router } from 'express';
import { workspacesController } from './workspaces.controller.js';
import { validateRequest } from '../../middlewares/validation.js';
import { requireWorkspaceMembership } from '../../middlewares/auth.js';
import { requirePermission } from '../../middlewares/rbac.js';
import { workspaceResolver } from '../../middlewares/workspaceResolver.js';
import {
  createWorkspaceSchema,
  inviteMemberSchema,
  listActivityQuerySchema,
  listAuditLogQuerySchema,
  memberParamsSchema,
  updateMemberRoleSchema,
  updateWorkspaceSchema,
  workspaceParamsSchema,
} from './workspaces.validation.js';

export const workspacesRoutes = Router();

workspacesRoutes.get('/', workspacesController.list);
workspacesRoutes.post('/', validateRequest(createWorkspaceSchema), workspacesController.create);

workspacesRoutes.get(
  '/:workspaceId',
  validateRequest(workspaceParamsSchema),
  workspaceResolver,
  requireWorkspaceMembership,
  workspacesController.getById,
);
workspacesRoutes.patch(
  '/:workspaceId',
  validateRequest(workspaceParamsSchema),
  validateRequest(updateWorkspaceSchema),
  workspaceResolver,
  requireWorkspaceMembership,
  requirePermission('workspace', 'update'),
  workspacesController.update,
);
workspacesRoutes.delete(
  '/:workspaceId',
  validateRequest(workspaceParamsSchema),
  workspaceResolver,
  requireWorkspaceMembership,
  requirePermission('workspace', 'delete'),
  workspacesController.remove,
);

workspacesRoutes.get(
  '/:workspaceId/members',
  validateRequest(workspaceParamsSchema),
  workspaceResolver,
  requireWorkspaceMembership,
  workspacesController.listMembers,
);
workspacesRoutes.post(
  '/:workspaceId/members/invite',
  validateRequest(workspaceParamsSchema),
  validateRequest(inviteMemberSchema),
  workspaceResolver,
  requireWorkspaceMembership,
  requirePermission('workspace', 'invite'),
  workspacesController.inviteMember,
);
workspacesRoutes.patch(
  '/:workspaceId/members/:userId',
  validateRequest(memberParamsSchema),
  validateRequest(updateMemberRoleSchema),
  workspaceResolver,
  requireWorkspaceMembership,
  requirePermission('workspace', 'manageMembers'),
  workspacesController.updateMember,
);
workspacesRoutes.delete(
  '/:workspaceId/members/:userId',
  validateRequest(memberParamsSchema),
  workspaceResolver,
  requireWorkspaceMembership,
  requirePermission('workspace', 'manageMembers'),
  workspacesController.removeMember,
);

workspacesRoutes.get(
  '/:workspaceId/audit-log',
  validateRequest(workspaceParamsSchema),
  validateRequest(listAuditLogQuerySchema),
  workspaceResolver,
  requireWorkspaceMembership,
  requirePermission('workspace', 'manageMembers'),
  workspacesController.auditLog,
);
workspacesRoutes.get(
  '/:workspaceId/activity',
  validateRequest(workspaceParamsSchema),
  validateRequest(listActivityQuerySchema),
  workspaceResolver,
  requireWorkspaceMembership,
  workspacesController.activity,
);

