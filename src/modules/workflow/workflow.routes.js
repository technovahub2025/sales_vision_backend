import { Router } from 'express';
import { workflowController } from './workflow.controller.js';

export const workflowRoutes = Router({ mergeParams: true });

workflowRoutes.get('/', workflowController.list);
workflowRoutes.post('/', workflowController.create);
workflowRoutes.post('/ensure-default', workflowController.ensureDefaultTaskWorkflow);
workflowRoutes.get('/:workflowId/statuses', workflowController.listStatuses);
workflowRoutes.post('/:workflowId/statuses', workflowController.createStatus);
workflowRoutes.patch('/:workflowId/statuses/:statusId', workflowController.updateStatus);
workflowRoutes.get('/:workflowId/transitions', workflowController.listTransitions);
workflowRoutes.post('/:workflowId/transitions', workflowController.createTransition);
workflowRoutes.delete('/:workflowId/transitions/:transitionId', workflowController.removeTransition);
