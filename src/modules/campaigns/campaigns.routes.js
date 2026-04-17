import { Router } from 'express';
import { campaignsController } from './campaigns.controller.js';

const router = Router({ mergeParams: true });

router.get('/', campaignsController.list);
router.post('/', campaignsController.create);
router.get('/report', campaignsController.exportReport);
router.get('/:id', campaignsController.getById);
router.get('/:id/report', campaignsController.exportReport);
router.post('/:id/duplicate', campaignsController.duplicate);
router.patch('/:id/status', campaignsController.transitionStatus);
router.patch('/:id', campaignsController.update);
router.delete('/:id', campaignsController.remove);
router.patch('/:id/restore', campaignsController.restore);

export const campaignsRoutes = router;

