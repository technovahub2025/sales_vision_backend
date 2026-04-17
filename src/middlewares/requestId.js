import { randomUUID } from 'node:crypto';

export function requestId(req, res, next) {
  if (!req.id) {
    req.id = randomUUID();
  }
  res.setHeader('x-request-id', req.id);
  return next();
}
