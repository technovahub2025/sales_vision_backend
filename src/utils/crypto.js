import crypto from 'node:crypto';

/** @param {string} raw */
export function sha256(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function randomToken(size = 48) {
  return crypto.randomBytes(size).toString('hex');
}

export function randomId(size = 12) {
  return crypto.randomBytes(size).toString('hex');
}
