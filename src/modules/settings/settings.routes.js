import { Router } from 'express';
import { settingsController } from './settings.controller.js';

const router = Router({ mergeParams: true });

router.get('/profile', settingsController.getProfile);
router.patch('/profile', settingsController.updateProfile);
router.get('/preferences', settingsController.getPreferences);
router.patch('/preferences', settingsController.updatePreferences);
router.get('/workspace', settingsController.getWorkspace);
router.patch('/workspace', settingsController.updateWorkspace);

export const settingsRoutes = router;
