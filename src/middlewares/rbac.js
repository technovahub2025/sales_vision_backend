import { fail } from '../utils/apiResponse.js';

const ROLE_RANK = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

const PERMISSION_MATRIX = {
  workspace: {
    delete: ['owner'],
    invite: ['owner', 'admin'],
    manageMembers: ['owner', 'admin'],
    update: ['owner', 'admin'],
    view: ['owner', 'admin', 'member', 'viewer'],
  },
  project: {
    create: ['owner', 'admin'],
    delete: ['owner', 'admin'],
    update: ['owner', 'admin', 'member'],
    view: ['owner', 'admin', 'member', 'viewer'],
  },
  task: {
    create: ['owner', 'admin', 'member'],
    update: ['owner', 'admin', 'member'],
    delete: ['owner', 'admin', 'member'],
    comment: ['owner', 'admin', 'member'],
    view: ['owner', 'admin', 'member', 'viewer'],
  },
  sprint: {
    manage: ['owner', 'admin'],
    view: ['owner', 'admin', 'member', 'viewer'],
  },
  workflow: {
    manage: ['owner', 'admin'],
    view: ['owner', 'admin', 'member', 'viewer'],
  },
  campaign: {
    manage: ['owner', 'admin'],
    view: ['owner', 'admin', 'member'],
  },
  crm: {
    view: ['owner', 'admin', 'member'],
    manage: ['owner', 'admin', 'member'],
  },
  analytics: {
    view: ['owner', 'admin', 'member', 'viewer'],
  },
};

/**
 * @param {string | undefined | null} role
 * @returns {'owner'|'admin'|'member'|'viewer'}
 */
function normalizeRole(role) {
  const next = String(role || 'viewer').trim().toLowerCase();
  if (next in ROLE_RANK) {
    return /** @type {'owner'|'admin'|'member'|'viewer'} */ (next);
  }
  return 'viewer';
}

/**
 * @param {string} resource
 * @param {string} action
 * @param {string} role
 */
export function checkPermission(resource, action, role) {
  const resourceKey = String(resource || '').trim();
  const actionKey = String(action || '').trim();

  const resourceRules = PERMISSION_MATRIX[resourceKey] || {};
  const allowedRoles = resourceRules[actionKey];

  // If resource/action is unknown, deny explicitly.
  if (!Array.isArray(allowedRoles) || !allowedRoles.length) {
    return false;
  }

  const normalizedRole = normalizeRole(role);
  return allowedRoles.some((allowed) => ROLE_RANK[normalizedRole] >= ROLE_RANK[normalizeRole(allowed)]);
}

/**
 * @param {string} resource
 * @param {string} action
 */
export function requirePermission(resource, action) {
  return (req, res, next) => {
    const role = normalizeRole(req.membership?.role || req.auth?.role);
    if (!checkPermission(resource, action, role)) {
      return res.status(403).json(fail('Forbidden for this action', 'FORBIDDEN'));
    }
    return next();
  };
}
