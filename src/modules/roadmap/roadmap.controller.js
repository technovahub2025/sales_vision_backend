import { ok } from '../../utils/apiResponse.js';
import { roadmapService } from './roadmap.service.js';

export const roadmapController = {
  async byProject(req, res, next) {
    try {
      const items = await roadmapService.byProject({
        workspaceId: req.workspaceId,
        projectId: req.params.projectId,
      });
      return res.status(200).json(ok(items, { total: items.length }));
    } catch (error) {
      return next(error);
    }
  },
};
