import { fail } from '../utils/apiResponse.js';
import { resolveWorkspaceId } from '../services/workspace.service.js';

export async function workspaceResolver(req, res, next) {
  try {
    const key = req.params.workspaceId;
    if (!key) {
      return res.status(400).json(fail('workspaceId is required', 'VALIDATION_ERROR'));
    }

    const workspaceId = await resolveWorkspaceId(key);
    if (!workspaceId) {
      return res.status(404).json(fail('Workspace not found', 'NOT_FOUND'));
    }

    req.workspaceId = workspaceId;
    req.workspaceKey = key;
    return next();
  } catch (error) {
    return next(error);
  }
}
