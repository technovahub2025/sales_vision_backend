import { Types } from 'mongoose';
import { verifyAccessToken } from '../config/jwt.js';
import { fail } from '../utils/apiResponse.js';
import { WorkspaceMember } from '../models/workspaceMember.model.js';
import { resolveAccessToken } from './authToken.js';

/** @typedef {{ userId: string, workspaceId: string, email: string, role: string, scope?: string, isSuperAdmin?: boolean }} AuthUser */

export function requireAuth(req, res, next) {
  try {
    const token = resolveAccessToken(req);

    if (!token) {
      return res.status(401).json(fail('Unauthorized', 'UNAUTHORIZED'));
    }

    const decoded = verifyAccessToken(token);
    req.auth = /** @type {AuthUser} */ ({
      userId: String(decoded.userId),
      workspaceId: decoded.workspaceId ? String(decoded.workspaceId) : '',
      email: String(decoded.email),
      role: String(decoded.role),
      scope: decoded.scope ? String(decoded.scope) : '',
      isSuperAdmin: decoded?.scope === 'super_admin' && decoded?.isSuperAdmin === true,
    });
    req.user = { _id: req.auth.userId, role: req.auth.role, email: req.auth.email };

    return next();
  } catch (error) {
    return res.status(401).json(fail('Unauthorized', 'UNAUTHORIZED'));
  }
}

export async function requireWorkspaceMembership(req, res, next) {
  try {
    const workspaceId = req.workspaceId;
    const auth = req.auth;

    if (!workspaceId || !auth?.userId) {
      return res.status(401).json(fail('Unauthorized', 'UNAUTHORIZED'));
    }

    const membership = await WorkspaceMember.findOne(
      {
        workspaceId: new Types.ObjectId(workspaceId),
        userId: new Types.ObjectId(auth.userId),
        status: 'active',
      },
      { _id: 1, role: 1 },
    ).lean();

    if (!membership) {
      return res.status(403).json(fail('Forbidden for this workspace', 'FORBIDDEN'));
    }

    req.membership = membership;
    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * @param {Array<'owner' | 'admin' | 'member' | 'viewer'>} roles
 */
export function requireMembershipRole(roles) {
  return (req, res, next) => {
    const role = String(req.membership?.role || '').toLowerCase();
    const allowed = roles.map((item) => String(item).toLowerCase());
    if (!role || !allowed.includes(role)) {
      return res.status(403).json(fail('Forbidden for this action', 'FORBIDDEN'));
    }
    return next();
  };
}
