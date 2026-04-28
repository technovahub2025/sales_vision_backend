import { Router } from 'express';
import { leadsController } from './leads.controller.js';
import { uploadFiles } from '../../middlewares/uploadMiddleware.js';
import { requirePermission } from '../../middlewares/rbac.js';

const router = Router({ mergeParams: true });

router.get('/pipeline', requirePermission('crm', 'view'), leadsController.pipeline);
router.get('/', requirePermission('crm', 'view'), leadsController.list);
router.post('/', requirePermission('crm', 'manage'), leadsController.create);
router.get('/:id', requirePermission('crm', 'view'), leadsController.getById);
router.patch('/:id', requirePermission('crm', 'manage'), leadsController.update);
router.patch('/:id/status', requirePermission('crm', 'manage'), leadsController.move);
router.delete('/:id', requirePermission('crm', 'manage'), leadsController.remove);
router.patch('/:id/restore', requirePermission('crm', 'manage'), leadsController.restore);
router.get('/:id/activity', requirePermission('crm', 'view'), leadsController.activity);
router.post('/:id/notes', requirePermission('crm', 'manage'), leadsController.addNote);
router.post('/:id/follow-up', requirePermission('crm', 'manage'), leadsController.followUp);
router.get('/:id/attachments', requirePermission('crm', 'view'), leadsController.listAttachments);
router.post('/:id/attachments', requirePermission('crm', 'manage'), uploadFiles, leadsController.addAttachment);
router.delete('/:id/attachments/:attachmentId', requirePermission('crm', 'manage'), leadsController.removeAttachment);

export const leadsRoutes = router;
