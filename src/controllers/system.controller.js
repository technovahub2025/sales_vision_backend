import mongoose from 'mongoose';
import { ok, fail } from '../utils/apiResponse.js';
import { getRedisClient } from '../config/redis.js';
import { getLegacyHits } from '../utils/legacyTelemetry.js';

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function checkMongo() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new Error('mongo not connected');
  }
  await withTimeout(mongoose.connection.db.admin().ping(), 2000);
}

async function checkRedis() {
  const redis = getRedisClient();
  if (!redis) {
    throw new Error('redis not configured');
  }
  await withTimeout(redis.ping(), 2000);
}

export async function health(req, res) {
  const result = {
    status: 'ok',
    uptime: Math.round(process.uptime()),
    version: process.env.npm_package_version || '0.0.0',
    services: {
      db: 'ok',
      redis: 'ok',
      queue: 'ok',
    },
  };

  try {
    await checkMongo();
  } catch {
    result.services.db = 'error';
  }

  try {
    await checkRedis();
  } catch {
    result.services.redis = 'error';
  }

  result.services.queue = result.services.redis === 'ok' ? 'ok' : 'error';
  if (Object.values(result.services).some((value) => value === 'error')) {
    result.status = 'degraded';
  }

  const statusCode = result.status === 'ok' ? 200 : 503;
  return res.status(statusCode).json(ok(result));
}

export function legacyUsage(req, res) {
  return res.status(200).json(
    ok({
      routes: getLegacyHits(),
      at: new Date().toISOString(),
    }),
  );
}

export function notFound(req, res) {
  res.status(404).json(fail('Route not found', 'NOT_FOUND'));
}
