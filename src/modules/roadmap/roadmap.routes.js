import { Router } from 'express';
import { roadmapController } from './roadmap.controller.js';
import { requirePlanFeature } from '../../middlewares/planGuards.js';

const router = Router({ mergeParams: true });
router.get('/projects/:projectId/roadmap', requirePlanFeature('roadmap'), roadmapController.byProject);

export const roadmapRoutes = router;
