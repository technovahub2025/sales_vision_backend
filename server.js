import 'dotenv/config';
import http from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createApp } from './src/app.js';
import { connectToDatabase, disconnectDatabase } from './src/config/db.js';
import { createRedisDuplicate, getRedisClient, isUsingMockRedis } from './src/config/redis.js';
import { registerSocketHandlers } from './src/sockets/index.js';
import { startNotificationScheduler, stopNotificationScheduler } from './src/modules/notifications/notifications.scheduler.js';
import { repairWorkspaceIntegrity } from './src/services/workspaceIntegrity.service.js';

const port = Number(process.env.PORT || 3001);
const clientOrigin = process.env.CLIENT_ORIGIN || '*';

const app = createApp();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: clientOrigin === '*' ? true : clientOrigin,
    credentials: true,
  },
});

function closeRedisClient(client) {
  if (!client) {
    return Promise.resolve();
  }
  if (client.status === 'ready' || client.status === 'connect') {
    return client.quit();
  }
  client.disconnect();
  return Promise.resolve();
}

async function enableRedisAdapter() {
  if (process.env.SOCKET_REDIS_ENABLED === 'false') {
    console.log('Socket.IO Redis adapter disabled by SOCKET_REDIS_ENABLED=false');
    return;
  }
  const redis = getRedisClient();
  if (!redis) {
    return;
  }
  if (isUsingMockRedis()) {
    console.log('Socket.IO Redis adapter disabled while using REDIS_MOCK_ENABLED=true');
    return;
  }

  const pubClient = createRedisDuplicate(redis, 'Redis pub');
  const subClient = createRedisDuplicate(redis, 'Redis sub');
  const [pubConnect, subConnect] = await Promise.allSettled([pubClient.connect(), subClient.connect()]);

  if (pubConnect.status === 'fulfilled' && subConnect.status === 'fulfilled') {
    io.adapter(createAdapter(pubClient, subClient));
    console.log('Socket.IO Redis adapter enabled');
    return;
  }

  console.warn('Redis unavailable; continuing without Socket.IO Redis adapter.');
  await Promise.allSettled([closeRedisClient(pubClient), closeRedisClient(subClient)]);
}

enableRedisAdapter().catch(() => {
  console.warn('Failed to initialize Socket.IO Redis adapter; continuing without it.');
});

registerSocketHandlers(io);
app.locals.io = io;
startNotificationScheduler(io);

async function start() {
  await connectToDatabase();
  if (process.env.RUN_WORKSPACE_INTEGRITY_REPAIR !== 'false') {
    const stats = await repairWorkspaceIntegrity({
      dryRun: process.env.WORKSPACE_INTEGRITY_DRY_RUN === 'true',
      limit: Number(process.env.WORKSPACE_INTEGRITY_LIMIT || 10000),
    });
    console.log('[workspace-integrity] completed', stats);
  }

  httpServer.on('error', async (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `Port ${port} is already in use. Stop the existing process or change PORT in .env.`
      );
      await disconnectDatabase();
      process.exit(1);
    }

    console.error('HTTP server error', error);
    await disconnectDatabase();
    process.exit(1);
  });

  httpServer.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

async function shutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);

  io.close();
  stopNotificationScheduler();
  httpServer.close(async () => {
    await disconnectDatabase();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
