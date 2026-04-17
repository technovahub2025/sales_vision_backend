import { Router } from 'express';
import { myTasksController } from './myTasks.controller.js';

const router = Router({ mergeParams: true });

router.get('/', myTasksController.list);
router.post('/quick-create', myTasksController.quickCreate);
router.patch('/reorder', myTasksController.reorder);
router.patch('/:taskId', myTasksController.patch);

export const myTasksRoutes = router;
