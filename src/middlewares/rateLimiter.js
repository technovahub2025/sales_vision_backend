import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedisClient } from '../config/redis.js';

/**
 * @param {{ windowMs?: number, max?: number, message?: string }} [options]
 */
export function buildRateLimiter(options = {}) {
  const redis = getRedisClient();
  const windowMs = options.windowMs ?? 60 * 1000;
  const max = options.max ?? 10;
  const message = options.message || 'Too many requests, please try again later.';
  
  // Check if Redis is connected before attempting to use it
  const isRedisConnected = redis && redis.status === 'ready';
  
  let store = null;
  if (isRedisConnected) {
    try {
      const sendRedisCommand = (...args) => {
        try {
          return Promise.resolve(redis.call(...args));
        } catch (error) {
          return Promise.reject(error);
        }
      };
      const redisStore = new RedisStore({ sendCommand: sendRedisCommand });
      // rate-limit-redis starts script loading in the constructor.
      // If Redis is down, those promises can reject before request handling begins.
      redisStore.incrementScriptSha?.catch(() => null);
      redisStore.getScriptSha?.catch(() => null);
      store = redisStore;
    } catch (error) {
      console.warn('Failed to initialize Redis store for rate limiting, falling back to memory store:', error.message);
    }
  }

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    skipSuccessfulRequests: false,
    handler: (req, res) => {
      const retryAfterMs = req.rateLimit?.resetTime
        ? Math.max(new Date(req.rateLimit.resetTime).getTime() - Date.now(), 0)
        : windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));

      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message: `${message} Retry in ${retryAfterSeconds}s.`,
        data: null,
        errors: [{ code: 'RATE_LIMITED', details: { retryAfterSeconds, limit: max, windowMs } }],
      });
    },
    ...(store ? { store } : {}),
  });
}
