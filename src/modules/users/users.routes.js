import { Router } from 'express';
import { usersController } from './users.controller.js';

const router = Router({ mergeParams: true });

router.get('/', usersController.list);

export const usersRoutes = router;
