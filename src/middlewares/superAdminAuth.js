import { verifyAccessToken } from '../config/jwt.js';
import { fail } from '../utils/apiResponse.js';
import { resolveAccessToken } from './authToken.js';

export function requireSuperAdmin(req, res, next) {
  try {
    const token = resolveAccessToken(req);
    if (!token) {
      return res.status(401).json(fail('Unauthorized', 'UNAUTHORIZED'));
    }

    const decoded = verifyAccessToken(token);
    if (decoded?.scope !== 'super_admin' || decoded?.isSuperAdmin !== true) {
      return res.status(403).json(fail('Super admin access required', 'FORBIDDEN'));
    }

    req.superAdmin = {
      id: String(decoded.userId || ''),
      email: String(decoded.email || ''),
      scope: 'super_admin',
    };
    return next();
  } catch {
    return res.status(401).json(fail('Unauthorized', 'UNAUTHORIZED'));
  }
}
