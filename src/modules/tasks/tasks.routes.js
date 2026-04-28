import { Router } from 'express';
import { tasksController } from './tasks.controller.js';
import { validateRequest } from '../../middlewares/validation.js';
import { uploadFiles } from '../../middlewares/uploadMiddleware.js';
import { requirePermission } from '../../middlewares/rbac.js';
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
tasksRoutes.post('/', requirePermission('task', 'create'), tasksController.create);
tasksRoutes.patch('/bulk', requirePermission('task', 'update'), validateRequest({ body: taskBulkBodySchema }), tasksController.bulkUpdate);

tasksRoutes.post('/:taskId/duplicate', requirePermission('task', 'create'), validateRequest({ params: taskIdParamsSchema }), tasksController.duplicate);
tasksRoutes.get(
  '/:taskId/activity',
  validateRequest({ params: taskIdParamsSchema, query: taskActivityQuerySchema }),
  tasksController.activity,
);
tasksRoutes.patch(
  '/:taskId/estimate',
  requirePermission('task', 'update'),
  validateRequest({ params: taskIdParamsSchema, body: taskEstimateBodySchema }),
  tasksController.setEstimate,
);

tasksRoutes.patch('/:taskId/status', requirePermission('task', 'update'), validateRequest({ params: taskIdParamsSchema }), tasksController.updateStatus);
tasksRoutes.get('/:taskId/attachments', validateRequest({ params: taskIdParamsSchema }), tasksController.listAttachments);
tasksRoutes.post(
  '/:taskId/attachments',
  requirePermission('task', 'update'),
  validateRequest({ params: taskIdParamsSchema }),
  uploadFiles,
  tasksController.createAttachment,
);
tasksRoutes.post('/:taskId/timer/start', requirePermission('task', 'update'), validateRequest({ params: taskIdParamsSchema }), tasksController.startTimer);
tasksRoutes.post('/:taskId/timer/stop', requirePermission('task', 'update'), validateRequest({ params: taskIdParamsSchema }), tasksController.stopTimer);
tasksRoutes.post('/:taskId/timer/pause', requirePermission('task', 'update'), validateRequest({ params: taskIdParamsSchema }), tasksController.pauseTimer);
tasksRoutes.post('/:taskId/timer/resume', requirePermission('task', 'update'), validateRequest({ params: taskIdParamsSchema }), tasksController.resumeTimer);
tasksRoutes.post('/:taskId/time-log', requirePermission('task', 'update'), validateRequest({ params: taskIdParamsSchema }), tasksController.createManualTimeLog);
tasksRoutes.get('/:taskId/time-logs', validateRequest({ params: taskIdParamsSchema }), tasksController.listTaskTimeLogs);
tasksRoutes.get('/:taskId/dependencies', validateRequest({ params: taskIdParamsSchema }), tasksController.getDependencies);
tasksRoutes.post('/:taskId/dependencies', requirePermission('task', 'update'), validateRequest({ params: taskIdParamsSchema }), tasksController.addDependency);
tasksRoutes.delete(
  '/:taskId/dependencies/:dependencyId',
  requirePermission('task', 'update'),
  validateRequest({ params: taskIdParamsSchema.extend({ dependencyId: taskIdParamsSchema.shape.taskId }) }),
  tasksController.removeDependency,
);
tasksRoutes.patch('/:taskId/approve', requirePermission('task', 'update'), validateRequest({ params: taskIdParamsSchema }), tasksController.approve);
tasksRoutes.post('/:taskId/attachments/url', requirePermission('task', 'update'), validateRequest({ params: taskIdParamsSchema }), tasksController.addAttachmentUrl);
tasksRoutes.delete(
  '/:taskId/attachments/:attachmentId',
  requirePermission('task', 'update'),
  validateRequest({ params: taskIdParamsSchema.extend({ attachmentId: taskIdParamsSchema.shape.taskId }) }),
  tasksController.removeAttachment,
);
tasksRoutes.delete(
  '/:taskId/attachments/url/:attachmentId',
  requirePermission('task', 'update'),
  validateRequest({ params: taskIdParamsSchema.extend({ attachmentId: taskIdParamsSchema.shape.taskId }) }),
  tasksController.removeAttachmentUrl,
);

tasksRoutes.get('/:id', tasksController.getById);
tasksRoutes.patch('/:id', requirePermission('task', 'update'), tasksController.update);
tasksRoutes.delete('/:id', requirePermission('task', 'delete'), tasksController.remove);
