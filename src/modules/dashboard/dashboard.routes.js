import { Router } from 'express';
import { dashboardController } from './dashboard.controller.js';

const router = Router({ mergeParams: true });

router.get('/', dashboardController.get);
router.post('/export-report', dashboardController.exportReport);
router.post('/strategy-meeting', dashboardController.strategyMeeting);

export const dashboardRoutes = router;
