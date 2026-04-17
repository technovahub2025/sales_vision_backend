import { Router } from 'express';
import { tasksController } from './tasks.controller.js';
import { validateRequest } from '../../middlewares/validation.js';
import { uploadFiles } from '../../middlewares/uploadMiddleware.js';
import {
  taskActivityQuerySchema,
  taskEstimateBodySchema,
  taskIdParamsSchema,
  taskListQuerySchema,
  taskBulkBodySchema,
} from './tasks.schemas.js';

export const tasksRoutes = Router({ mergeParams: true });

tasksRoutes.get('/export/csv', validateRequest({ query: taskListQuerySchema }), tasksController.exportCsv);
tasksRoutes.get('/', validateRequest({ query: taskListQuerySchema }), tasksController.list);
tasksRoutes.post('/', tasksController.create);
tasksRoutes.patch('/bulk', validateRequest({ body: taskBulkBodySchema }), tasksController.bulkUpdate);

tasksRoutes.post('/:taskId/duplicate', validateRequest({ params: taskIdParamsSchema }), tasksController.duplicate);
tasksRoutes.get(
  '/:taskId/activity',
  validateRequest({ params: taskIdParamsSchema, query: taskActivityQuerySchema }),
  tasksController.activity,
);
tasksRoutes.patch(
  '/:taskId/estimate',
  validateRequest({ params: taskIdParamsSchema, body: taskEstimateBodySchema }),
  tasksController.setEstimate,
);

tasksRoutes.patch('/:taskId/status', validateRequest({ params: taskIdParamsSchema }), tasksController.updateStatus);
tasksRoutes.get('/:taskId/attachments', validateRequest({ params: taskIdParamsSchema }), tasksController.listAttachments);
tasksRoutes.post(
  '/:taskId/attachments',
  validateRequest({ params: taskIdParamsSchema }),
  uploadFiles,
  tasksController.createAttachment,
);
tasksRoutes.post('/:taskId/timer/start', validateRequest({ params: taskIdParamsSchema }), tasksController.startTimer);
tasksRoutes.post('/:taskId/timer/stop', validateRequest({ params: taskIdParamsSchema }), tasksController.stopTimer);
tasksRoutes.post('/:taskId/timer/pause', validateRequest({ params: taskIdParamsSchema }), tasksController.pauseTimer);
tasksRoutes.post('/:taskId/timer/resume', validateRequest({ params: taskIdParamsSchema }), tasksController.resumeTimer);
tasksRoutes.post('/:taskId/time-log', validateRequest({ params: taskIdParamsSchema }), tasksController.createManualTimeLog);
tasksRoutes.get('/:taskId/time-logs', validateRequest({ params: taskIdParamsSchema }), tasksController.listTaskTimeLogs);
tasksRoutes.get('/:taskId/dependencies', validateRequest({ params: taskIdParamsSchema }), tasksController.getDependencies);
tasksRoutes.post('/:taskId/dependencies', validateRequest({ params: taskIdParamsSchema }), tasksController.addDependency);
tasksRoutes.delete(
  '/:taskId/dependencies/:dependencyId',
  validateRequest({ params: taskIdParamsSchema.extend({ dependencyId: taskIdParamsSchema.shape.taskId }) }),
  tasksController.removeDependency,
);
tasksRoutes.patch('/:taskId/approve', validateRequest({ params: taskIdParamsSchema }), tasksController.approve);
tasksRoutes.post('/:taskId/attachments/url', validateRequest({ params: taskIdParamsSchema }), tasksController.addAttachmentUrl);
tasksRoutes.delete(
  '/:taskId/attachments/:attachmentId',
  validateRequest({ params: taskIdParamsSchema.extend({ attachmentId: taskIdParamsSchema.shape.taskId }) }),
  tasksController.removeAttachment,
);
tasksRoutes.delete(
  '/:taskId/attachments/url/:attachmentId',
  validateRequest({ params: taskIdParamsSchema.extend({ attachmentId: taskIdParamsSchema.shape.taskId }) }),
  tasksController.removeAttachmentUrl,
);

tasksRoutes.get('/:id', tasksController.getById);
tasksRoutes.patch('/:id', tasksController.update);
tasksRoutes.delete('/:id', tasksController.remove);
