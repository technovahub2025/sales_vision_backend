import { ok, fail } from '../utils/apiResponse.js';
import { seedWorkspaceData } from '../services/seed.service.js';
import { ensureWorkspace } from '../services/workspace.service.js';

export async function seedWorkspace(req, res, next) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json(fail('Seed endpoint is disabled in production', 'FORBIDDEN'));
    }

    const { workspaceId: workspaceKey } = req.params;
    const workspaceId = await ensureWorkspace(workspaceKey);
    const data = await seedWorkspaceData(workspaceId);
    return res.status(200).json(ok(data));
  } catch (error) {
    return next(error);
  }
}
