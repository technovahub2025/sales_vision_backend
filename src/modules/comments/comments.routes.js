import { createCrudRoutes } from '../createCrudRoutes.js';
import { commentsController } from './comments.controller.js';
import { Router } from 'express';
import { uploadFiles } from '../../middlewares/uploadMiddleware.js';

export const commentsRoutes = createCrudRoutes(commentsController);
commentsRoutes.get('/by-task/:taskId', commentsController.listByTask);
commentsRoutes.post('/:commentId/attachments', uploadFiles, commentsController.addAttachment);
commentsRoutes.delete('/:commentId/attachments/:attachmentId', commentsController.removeAttachment);

const taskScoped = Router({ mergeParams: true });
taskScoped.get('/tasks/:taskId/comments', commentsController.listByTask);
taskScoped.post('/tasks/:taskId/comments', commentsController.createForTask);
taskScoped.get('/leads/:leadId/comments', commentsController.listByLead);
taskScoped.post('/leads/:leadId/comments', commentsController.createForLead);

export const taskCommentsRoutes = taskScoped;
