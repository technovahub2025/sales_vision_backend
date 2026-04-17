import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

let redisClient = null;
let usingMockRedis = false;
const loggedRedisErrors = new Set();
const verboseRedisLogs = process.env.REDIS_LOG_ERRORS === 'true';

const redisOptions = {
  maxRetriesPerRequest: 1,
  enableAutoPipelining: false,
  lazyConnect: true,
  enableOfflineQueue: false,
  // Disable reconnect loops when Redis is down to avoid noisy logs.
  retryStrategy: () => null,
};

/**
 * @param {unknown} error
 */
function getErrorMessage(error) {
  if (!error) {
    return 'Unknown Redis error';
  }
  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }
  if (error.code) {
    return String(error.code);
  }
  return String(error);
}

/**
 * @param {Redis} client
 * @param {string} name
 */
function attachRedisErrorHandler(client, name) {
  client.on('error', (error) => {
    if (!verboseRedisLogs) {
      return;
    }
    const message = getErrorMessage(error);
    const key = `${name}:${message}`;
    if (loggedRedisErrors.has(key)) {
      return;
    }
    loggedRedisErrors.add(key);
    console.error(`${name} error: ${message}`);
  });
}

/** @returns {Redis | null} */
export function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  if (process.env.REDIS_MOCK_ENABLED === 'true') {
    redisClient = new RedisMock();
    usingMockRedis = true;
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  redisClient = new Redis(redisUrl, redisOptions);
  attachRedisErrorHandler(redisClient, 'Redis');

  return redisClient;
}

export function isUsingMockRedis() {
  return usingMockRedis;
}

/**
 * @param {Redis} client
 * @param {string} [name]
 */
export function createRedisDuplicate(client, name = 'Redis duplicate') {
  const duplicate = client.duplicate(redisOptions);
  attachRedisErrorHandler(duplicate, name);
  return duplicate;
}
