import { Types } from 'mongoose';
import { verifyAccessToken } from '../config/jwt.js';
import { WorkspaceMember } from '../models/workspaceMember.model.js';
import { resolveWorkspaceId } from '../services/workspace.service.js';
import { ApiError } from '../utils/ApiError.js';
import { resolveAccessToken } from './authToken.js';

/** @typedef {{ userId: string, workspaceId: string, email: string, role: string }} AuthUser */

export async function requireWorkspaceMember(req, res, next) {
  try {
    const token = resolveAccessToken(req);
    if (!token) {
      throw new ApiError(401, 'Authentication required.', 'UNAUTHORIZED');
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch {
      throw new ApiError(401, 'Authentication required.', 'UNAUTHORIZED');
    }

    req.auth = /** @type {AuthUser} */ ({
      userId: String(decoded.userId),
      workspaceId: String(decoded.workspaceId),
      email: String(decoded.email),
      role: String(decoded.role),
    });
    req.user = { _id: req.auth.userId, role: req.auth.role, email: req.auth.email };

    const workspaceKey = req.params.workspaceId;
    const resolvedId = await resolveWorkspaceId(workspaceKey);
    if (!resolvedId) {
      console.warn('[workspace-diagnostics] invalid-workspace', {
        userId: req.auth.userId,
        workspaceKey,
      });
      throw new ApiError(404, 'Workspace not found.', 'WORKSPACE_NOT_FOUND');
    }

    const membership = await WorkspaceMember.findOne(
      {
        workspaceId: new Types.ObjectId(resolvedId),
        userId: new Types.ObjectId(req.auth.userId),
        status: 'active',
      },
      { _id: 1, role: 1 },
    ).lean();

    if (!membership) {
      const hasAnyMembership = await WorkspaceMember.findOne(
        { userId: new Types.ObjectId(req.auth.userId), status: 'active' },
        { _id: 1 },
      ).lean();
      console.warn('[workspace-diagnostics] membership-failure', {
        userId: req.auth.userId,
        workspaceKey,
        workspaceId: resolvedId,
        classification: hasAnyMembership ? 'forbidden' : 'no-membership',
      });
      throw new ApiError(403, 'You are not a member of this workspace.', 'FORBIDDEN');
    }

    req.workspaceId = resolvedId;
    req.workspaceKey = workspaceKey;
    req.membership = membership;
    return next();
  } catch (error) {
    return next(error);
  }
}
