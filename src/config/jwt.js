import jwt from 'jsonwebtoken';

const ACCESS_COOKIE = 'sv_access_token';
const REFRESH_COOKIE = 'sv_refresh_token';

function must(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function accessTokenSecret() {
  return must('JWT_ACCESS_SECRET', null);
}

export function refreshTokenSecret() {
  return must('JWT_REFRESH_SECRET', null);
}

export function accessTokenTtl() {
  return process.env.JWT_ACCESS_TTL || '15m';
}

export function refreshTokenTtl() {
  return process.env.JWT_REFRESH_TTL || '7d';
}

/** @param {{ userId: string, workspaceId: string, email: string, role: string }} payload */
export function signAccessToken(payload) {
  return jwt.sign(payload, accessTokenSecret(), { expiresIn: accessTokenTtl() });
}

/** @param {{ userId: string, tokenFamily: string, sessionId: string }} payload */
export function signRefreshToken(payload) {
  return jwt.sign(payload, refreshTokenSecret(), { expiresIn: refreshTokenTtl() });
}

/** @param {string} token */
export function verifyAccessToken(token) {
  return jwt.verify(token, accessTokenSecret());
}

/** @param {string} token */
export function verifyRefreshToken(token) {
  return jwt.verify(token, refreshTokenSecret());
}

export function getAccessCookieName() {
  return ACCESS_COOKIE;
}

export function getRefreshCookieName() {
  return REFRESH_COOKIE;
}

export function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeMs,
  };
}
