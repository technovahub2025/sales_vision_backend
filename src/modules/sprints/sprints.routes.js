import { Router } from 'express';
import { sprintsController } from './sprints.controller.js';
import { requirePermission } from '../../middlewares/rbac.js';

const projectRouter = Router({ mergeParams: true });
projectRouter.get('/projects/:projectId/sprints', sprintsController.listByProject);
projectRouter.post('/projects/:projectId/sprints', requirePermission('sprint', 'manage'), sprintsController.create);
projectRouter.get('/projects/:projectId/backlog', sprintsController.backlog);
projectRouter.patch('/tasks/:taskId/backlog-order', requirePermission('task', 'update'), sprintsController.setBacklogOrder);

const sprintRouter = Router({ mergeParams: true });
sprintRouter.patch('/sprints/:id/start', requirePermission('sprint', 'manage'), sprintsController.start);
sprintRouter.patch('/sprints/:id/complete', requirePermission('sprint', 'manage'), sprintsController.complete);
sprintRouter.get('/sprints/:id/board', sprintsController.board);
sprintRouter.get('/sprints/:id/burndown', sprintsController.burndown);
sprintRouter.post('/sprints/:id/tasks', requirePermission('sprint', 'manage'), sprintsController.addBacklogTasks);
sprintRouter.get('/sprints/:id/items', sprintsController.listSprintItems);
sprintRouter.post('/sprints/:id/items', requirePermission('sprint', 'manage'), sprintsController.addSprintItem);
sprintRouter.patch('/sprints/:id/items/reorder', requirePermission('sprint', 'manage'), sprintsController.reorderSprintItems);
sprintRouter.get('/sprints/:id/incomplete-tasks', sprintsController.incompleteTasks);

export const sprintsProjectRoutes = projectRouter;
export const sprintsRoutes = sprintRouter;
