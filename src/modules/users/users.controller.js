import { ok } from '../../utils/apiResponse.js';
import { usersService } from './users.service.js';

export const usersController = {
  async list(req, res, next) {
    try {
      const { items, meta } = await usersService.list({ workspaceId: req.workspaceId, query: req.query });
      return res.status(200).json(ok(items, meta));
    } catch (error) {
      return next(error);
    }
  },
};
