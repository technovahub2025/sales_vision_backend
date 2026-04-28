import { Router } from 'express';
import { contactsController } from './contacts.controller.js';
import { requirePermission } from '../../middlewares/rbac.js';

export const contactsRoutes = Router({ mergeParams: true });

contactsRoutes.get('/', requirePermission('crm', 'view'), contactsController.list);
contactsRoutes.post('/', requirePermission('crm', 'manage'), contactsController.create);
contactsRoutes.get('/:id', requirePermission('crm', 'view'), contactsController.getById);
contactsRoutes.patch('/:id', requirePermission('crm', 'manage'), contactsController.update);
contactsRoutes.delete('/:id', requirePermission('crm', 'manage'), contactsController.remove);
