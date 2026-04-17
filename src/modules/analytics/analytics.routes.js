import { Router } from 'express';
import { createCrudRoutes } from '../createCrudRoutes.js';
import { analyticsController } from './analytics.controller.js';
import { requireMembershipRole } from '../../middlewares/auth.js';

const router = Router({ mergeParams: true });

router.get('/overview', analyticsController.overview);
router.get('/project-health', analyticsController.projectHealth);
router.get('/export', requireMembershipRole(['owner', 'admin']), analyticsController.exportReport);

const crudRoutes = createCrudRoutes(analyticsController);
router.use('/', crudRoutes);

export const analyticsRoutes = router;
