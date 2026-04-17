import { attachmentsService } from './attachments.service.js';
import { ok, fail } from '../../utils/apiResponse.js';

export const attachmentsController = {
  async uploadGeneric(req, res, next) {
    try {
      if (!req.files || !req.files.length) {
        return res.status(400).json(fail('files are required', 'VALIDATION_ERROR'));
      }
      const entityType = String(req.body?.entityType || '').trim();
      const entityId = String(req.body?.entityId || '').trim();
      if (!entityType || !entityId) {
        return res.status(400).json(fail('entityType and entityId are required', 'VALIDATION_ERROR'));
      }

      const created = await attachmentsService.uploadMany({
        workspaceId: req.workspaceId,
        entityType,
        entityId,
        files: req.files || [],
        user: req.user,
        io: req.app.locals.io,
      });
      if (!created) return res.status(404).json(fail('Entity not found', 'NOT_FOUND'));
      return res.status(201).json(ok(created));
    } catch (error) {
      return next(error);
    }
  },
};
