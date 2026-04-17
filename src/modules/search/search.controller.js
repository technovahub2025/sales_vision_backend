import { ok, fail } from '../../utils/apiResponse.js';
import { searchService } from './search.service.js';

export const searchController = {
  async search(req, res, next) {
    try {
      const q = String(req.query?.q || '').trim();
      if (!q) {
        return res.status(400).json(fail('q is required', 'VALIDATION_ERROR'));
      }
      const data = await searchService.search({ workspaceId: req.workspaceId, query: q });
      return res.status(200).json(ok(data));
    } catch (error) {
      return next(error);
    }
  },
};
