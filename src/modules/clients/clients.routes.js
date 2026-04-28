import { Router } from 'express';
import { clientsController } from './clients.controller.js';
import { requirePermission } from '../../middlewares/rbac.js';

const router = Router({ mergeParams: true });

router.get('/', requirePermission('crm', 'view'), clientsController.list);
router.post('/', requirePermission('crm', 'manage'), clientsController.create);
router.get('/:id', requirePermission('crm', 'view'), clientsController.getById);
router.patch('/:id', requirePermission('crm', 'manage'), clientsController.update);
router.delete('/:id', requirePermission('crm', 'manage'), clientsController.remove);
router.patch('/:id/restore', requirePermission('crm', 'manage'), clientsController.restore);
router.get('/:id/leads', requirePermission('crm', 'view'), clientsController.leads);
router.get('/:id/projects', requirePermission('crm', 'view'), clientsController.projects);
router.post('/:id/notes', requirePermission('crm', 'manage'), clientsController.addNote);

export const clientsRoutes = router;
