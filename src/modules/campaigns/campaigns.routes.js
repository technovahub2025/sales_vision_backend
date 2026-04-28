import { Router } from 'express';
import { campaignsController } from './campaigns.controller.js';
import { requirePermission } from '../../middlewares/rbac.js';

const router = Router({ mergeParams: true });

router.get('/', requirePermission('campaign', 'view'), campaignsController.list);
router.post('/', requirePermission('campaign', 'manage'), campaignsController.create);
router.get('/report', requirePermission('campaign', 'view'), campaignsController.exportReport);
router.get('/:id', requirePermission('campaign', 'view'), campaignsController.getById);
router.get('/:id/report', requirePermission('campaign', 'view'), campaignsController.exportReport);
router.post('/:id/duplicate', requirePermission('campaign', 'manage'), campaignsController.duplicate);
router.patch('/:id/status', requirePermission('campaign', 'manage'), campaignsController.transitionStatus);
router.patch('/:id', requirePermission('campaign', 'manage'), campaignsController.update);
router.delete('/:id', requirePermission('campaign', 'manage'), campaignsController.remove);
router.patch('/:id/restore', requirePermission('campaign', 'manage'), campaignsController.restore);

export const campaignsRoutes = router;

