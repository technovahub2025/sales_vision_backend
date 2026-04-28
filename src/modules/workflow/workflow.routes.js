import { Router } from 'express';
import { workflowController } from './workflow.controller.js';
import { requirePermission } from '../../middlewares/rbac.js';

export const workflowRoutes = Router({ mergeParams: true });

workflowRoutes.get('/', workflowController.list);
workflowRoutes.post('/', requirePermission('workflow', 'manage'), workflowController.create);
workflowRoutes.post('/ensure-default', requirePermission('workflow', 'manage'), workflowController.ensureDefaultTaskWorkflow);
workflowRoutes.get('/:workflowId/statuses', workflowController.listStatuses);
workflowRoutes.post('/:workflowId/statuses', requirePermission('workflow', 'manage'), workflowController.createStatus);
workflowRoutes.patch('/:workflowId/statuses/:statusId', requirePermission('workflow', 'manage'), workflowController.updateStatus);
workflowRoutes.get('/:workflowId/transitions', workflowController.listTransitions);
workflowRoutes.post('/:workflowId/transitions', requirePermission('workflow', 'manage'), workflowController.createTransition);
workflowRoutes.delete('/:workflowId/transitions/:transitionId', requirePermission('workflow', 'manage'), workflowController.removeTransition);
