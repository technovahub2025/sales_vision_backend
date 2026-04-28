import { commentsController } from './comments.controller.js';
import { Router } from 'express';
import { uploadFiles } from '../../middlewares/uploadMiddleware.js';
import { requirePermission } from '../../middlewares/rbac.js';

export const commentsRoutes = Router({ mergeParams: true });
commentsRoutes.get('/', commentsController.list);
commentsRoutes.post('/', requirePermission('task', 'comment'), commentsController.create);
commentsRoutes.get('/by-task/:taskId', commentsController.listByTask);
commentsRoutes.get('/:id', commentsController.getById);
commentsRoutes.patch('/:id', requirePermission('task', 'comment'), commentsController.update);
commentsRoutes.delete('/:id', requirePermission('task', 'comment'), commentsController.remove);
commentsRoutes.post('/:commentId/attachments', requirePermission('task', 'comment'), uploadFiles, commentsController.addAttachment);
commentsRoutes.delete('/:commentId/attachments/:attachmentId', requirePermission('task', 'comment'), commentsController.removeAttachment);

const taskScoped = Router({ mergeParams: true });
taskScoped.get('/tasks/:taskId/comments', commentsController.listByTask);
taskScoped.post('/tasks/:taskId/comments', requirePermission('task', 'comment'), commentsController.createForTask);
taskScoped.get('/leads/:leadId/comments', requirePermission('crm', 'view'), commentsController.listByLead);
taskScoped.post('/leads/:leadId/comments', requirePermission('crm', 'manage'), commentsController.createForLead);

export const taskCommentsRoutes = taskScoped;
