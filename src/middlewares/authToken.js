import { getAccessCookieName } from '../config/jwt.js';

function readHeaderToken(req) {
  const raw = String(req.headers.authorization || '').trim();
  if (!raw) return null;
  const parts = raw.split(/\s+/);
  if (parts.length < 2) return null;
  if (String(parts[0]).toLowerCase() !== 'bearer') return null;
  return parts.slice(1).join(' ').trim() || null;
}

export function resolveAccessToken(req) {
  const bearer = readHeaderToken(req);
  if (bearer) return bearer;
  const cookieName = getAccessCookieName();
  const cookieToken = req.cookies?.[cookieName];
  if (cookieToken) return String(cookieToken);
  // Backward compatibility with legacy cookie names used in older deployments.
  return (
    req.cookies?.accessToken ||
    req.cookies?.sv_access ||
    req.cookies?.token ||
    null
  );
}
