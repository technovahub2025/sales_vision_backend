import { fail } from '../utils/apiResponse.js';

export function sanitize(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    for (const [key, value] of Object.entries(req.body)) {
      if (typeof value === 'string') {
        req.body[key] = value.trim();
      }
    }
  }

  next();
}

export function payloadLimit(req, res, next) {
  const length = Number(req.headers['content-length'] || 0);
  if (length > 1024 * 1024) {
    return res.status(413).json(fail('Payload too large', 'PAYLOAD_TOO_LARGE'));
  }

  return next();
}
