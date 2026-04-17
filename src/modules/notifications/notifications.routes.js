import { Router } from 'express';
import { notificationsController } from './notifications.controller.js';
import { validateRequest } from '../../middlewares/validation.js';
import {
  notificationIdParamsSchema,
  notificationsListQuerySchema,
  notificationsReadAllBodySchema,
} from './notifications.schemas.js';

const router = Router({ mergeParams: true });

router.get('/', validateRequest({ query: notificationsListQuerySchema }), notificationsController.list);
router.post('/read-all', validateRequest({ body: notificationsReadAllBodySchema }), notificationsController.markAllRead);
router.patch('/read-all', validateRequest({ body: notificationsReadAllBodySchema }), notificationsController.markAllRead);
router.patch('/:id/read', validateRequest({ params: notificationIdParamsSchema }), notificationsController.markRead);
router.delete('/:id', validateRequest({ params: notificationIdParamsSchema }), notificationsController.remove);

export const notificationsRoutes = router;
