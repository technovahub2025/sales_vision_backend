import { Router } from 'express';
import { activityController } from './activity.controller.js';

const router = Router({ mergeParams: true });

router.get('/', activityController.list);
router.get('/feed', activityController.feed);

export const activityRoutes = router;
