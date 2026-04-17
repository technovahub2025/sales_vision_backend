import { Router } from 'express';
import { sprintsController } from './sprints.controller.js';

const projectRouter = Router({ mergeParams: true });
projectRouter.get('/projects/:projectId/sprints', sprintsController.listByProject);
projectRouter.post('/projects/:projectId/sprints', sprintsController.create);
projectRouter.get('/projects/:projectId/backlog', sprintsController.backlog);
projectRouter.patch('/tasks/:taskId/backlog-order', sprintsController.setBacklogOrder);

const sprintRouter = Router({ mergeParams: true });
sprintRouter.patch('/sprints/:id/start', sprintsController.start);
sprintRouter.patch('/sprints/:id/complete', sprintsController.complete);
sprintRouter.get('/sprints/:id/board', sprintsController.board);
sprintRouter.get('/sprints/:id/burndown', sprintsController.burndown);
sprintRouter.post('/sprints/:id/tasks', sprintsController.addBacklogTasks);
sprintRouter.get('/sprints/:id/items', sprintsController.listSprintItems);
sprintRouter.post('/sprints/:id/items', sprintsController.addSprintItem);
sprintRouter.patch('/sprints/:id/items/reorder', sprintsController.reorderSprintItems);
sprintRouter.get('/sprints/:id/incomplete-tasks', sprintsController.incompleteTasks);

export const sprintsProjectRoutes = projectRouter;
export const sprintsRoutes = sprintRouter;
