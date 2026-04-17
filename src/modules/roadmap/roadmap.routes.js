import { Router } from 'express';
import { roadmapController } from './roadmap.controller.js';

const router = Router({ mergeParams: true });
router.get('/projects/:projectId/roadmap', roadmapController.byProject);

export const roadmapRoutes = router;
