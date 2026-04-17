import { ok, fail } from '../../utils/apiResponse.js';
import { invitesService } from './invites.service.js';

export const invitesController = {
  async list(req, res, next) {
    try {
      const { items, meta } = await invitesService.list({
        workspaceId: req.workspaceId,
        query: req.query,
      });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      return next(error);
    }
  },

  async create(req, res, next) {
    try {
      const invite = await invitesService.create({
        workspaceId: req.workspaceId,
        actorUserId: req.auth.userId,
        data: req.body,
      });
      return res.status(201).json(ok(invite, 'Invite created'));
    } catch (error) {
      return next(error);
    }
  },

  async revoke(req, res, next) {
    try {
      const invite = await invitesService.revoke({
        workspaceId: req.workspaceId,
        inviteId: req.params.inviteId,
      });
      if (!invite) {
        return res.status(404).json(fail('Invite not found', 'NOT_FOUND'));
      }
      return res.status(200).json(ok(invite, 'Invite revoked'));
    } catch (error) {
      return next(error);
    }
  },
};
