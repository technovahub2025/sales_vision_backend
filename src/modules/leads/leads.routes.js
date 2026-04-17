import { Router } from 'express';
import { leadsController } from './leads.controller.js';
import { uploadFiles } from '../../middlewares/uploadMiddleware.js';

const router = Router({ mergeParams: true });

router.get('/pipeline', leadsController.pipeline);
router.get('/', leadsController.list);
router.post('/', leadsController.create);
router.get('/:id', leadsController.getById);
router.patch('/:id', leadsController.update);
router.patch('/:id/status', leadsController.move);
router.delete('/:id', leadsController.remove);
router.patch('/:id/restore', leadsController.restore);
router.get('/:id/activity', leadsController.activity);
router.post('/:id/notes', leadsController.addNote);
router.post('/:id/follow-up', leadsController.followUp);
router.get('/:id/attachments', leadsController.listAttachments);
router.post('/:id/attachments', uploadFiles, leadsController.addAttachment);
router.delete('/:id/attachments/:attachmentId', leadsController.removeAttachment);

export const leadsRoutes = router;
