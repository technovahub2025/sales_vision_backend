import { Router } from 'express';
import { attachmentsController } from './attachments.controller.js';
import { uploadFiles } from '../../middlewares/uploadMiddleware.js';

export const attachmentsRoutes = Router({ mergeParams: true });

attachmentsRoutes.post('/upload', uploadFiles, attachmentsController.uploadGeneric);
