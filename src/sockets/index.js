import { workspaceRoom, moduleRoom, entityRoom, projectRoom, taskRoom, userRoom } from './rooms.js';
import { resolveWorkspaceId } from '../services/workspace.service.js';
import { getAccessCookieName, verifyAccessToken } from '../config/jwt.js';
import { WorkspaceMember } from '../models/workspaceMember.model.js';

function parseCookieHeader(cookieHeader = '') {
  return String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, item) => {
      const idx = item.indexOf('=');
      if (idx < 0) return acc;
      const key = item.slice(0, idx).trim();
      const value = item.slice(idx + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function resolveSocketToken(socket) {
  const authToken = socket.handshake?.auth?.token || '';
  if (authToken) return String(authToken);
  const bearer = socket.handshake?.headers?.authorization || '';
  if (bearer.startsWith('Bearer ')) {
    return bearer.slice(7);
  }
  const cookies = parseCookieHeader(socket.handshake?.headers?.cookie || '');
  return cookies[getAccessCookieName()] || '';
}

async function authorizeWorkspaceMembership(socket, workspaceId) {
  const auth = socket?.data?.auth;
  if (!auth?.userId || !workspaceId) return false;
  const membership = await WorkspaceMember.findOne(
    { workspaceId, userId: auth.userId, status: 'active' },
    { _id: 1 },
  ).lean();
  return Boolean(membership?._id);
}

export function registerSocketHandlers(io) {
  io.use((socket, next) => {
    try {
      const token = resolveSocketToken(socket);
      if (!token) {
        const error = new Error('UNAUTHORIZED_SOCKET');
        error.data = { code: 'UNAUTHORIZED' };
        return next(error);
      }
      const decoded = verifyAccessToken(token);
      socket.data.auth = {
        userId: String(decoded.userId || ''),
        workspaceId: String(decoded.workspaceId || ''),
        email: String(decoded.email || ''),
        role: String(decoded.role || ''),
      };
      return next();
    } catch {
      const error = new Error('UNAUTHORIZED_SOCKET');
      error.data = { code: 'UNAUTHORIZED' };
      return next(error);
    }
  });

  io.on('connection', (socket) => {
    const joinRooms = ({ workspaceKeys = [], projectId, taskId, userId, modules = [], entities = [] } = {}) => {
      for (const key of workspaceKeys) {
        socket.join(workspaceRoom(key));
      }

      if (projectId) {
        for (const key of workspaceKeys) {
          socket.join(projectRoom(key, projectId));
        }
      }

      if (taskId) {
        socket.join(taskRoom(taskId));
      }

      if (userId) {
        socket.join(userRoom(userId));
      }

      for (const moduleName of modules) {
        for (const key of workspaceKeys) {
          socket.join(moduleRoom(key, moduleName));
        }
      }

      for (const entity of entities) {
        if (!entity?.module || !entity?.id) continue;
        for (const key of workspaceKeys) {
          socket.join(entityRoom(key, entity.module, entity.id));
        }
        if (String(entity.module) === 'tasks') {
          socket.join(taskRoom(entity.id));
        }
      }
    };

    const leaveRooms = ({ workspaceKeys = [], projectId, taskId, userId, modules = [], entities = [] } = {}) => {
      for (const key of workspaceKeys) {
        socket.leave(workspaceRoom(key));
      }

      if (projectId) {
        for (const key of workspaceKeys) {
          socket.leave(projectRoom(key, projectId));
        }
      }

      if (taskId) {
        socket.leave(taskRoom(taskId));
      }

      if (userId) {
        socket.leave(userRoom(userId));
      }

      for (const moduleName of modules) {
        for (const key of workspaceKeys) {
          socket.leave(moduleRoom(key, moduleName));
        }
      }

      for (const entity of entities) {
        if (!entity?.module || !entity?.id) continue;
        for (const key of workspaceKeys) {
          socket.leave(entityRoom(key, entity.module, entity.id));
        }
        if (String(entity.module) === 'tasks') {
          socket.leave(taskRoom(entity.id));
        }
      }
    };

    socket.on('workspace:join', async ({ workspaceId, projectId, taskId, userId, modules = [], entities = [] } = {}) => {
      if (!workspaceId) {
        return;
      }

      const workspaceKey = String(workspaceId);
      const resolvedWorkspaceId = await resolveWorkspaceId(workspaceKey);
      if (!resolvedWorkspaceId) {
        socket.emit('workspace:join_error', { code: 'INVALID_WORKSPACE', workspaceId: workspaceKey });
        return;
      }
      const allowed = await authorizeWorkspaceMembership(socket, resolvedWorkspaceId);
      if (!allowed) {
        socket.emit('workspace:join_error', { code: 'FORBIDDEN', workspaceId: workspaceKey });
        return;
      }
      const workspaceKeys = Array.from(
        new Set([workspaceKey, resolvedWorkspaceId].filter(Boolean).map((value) => String(value))),
      );

      joinRooms({
        workspaceKeys,
        projectId,
        taskId,
        userId: userId || socket.data?.auth?.userId || '',
        modules,
        entities,
      });

      socket.emit('workspace:joined', {
        workspaceId: resolvedWorkspaceId || workspaceKey,
        workspaceKey,
        projectId: projectId || null,
        taskId: taskId || null,
        userId: userId || null,
        modules,
      });
    });

    socket.on('workspace:leave', async ({ workspaceId, projectId, taskId, userId, modules = [], entities = [] } = {}) => {
      if (!workspaceId) {
        return;
      }

      const workspaceKey = String(workspaceId);
      const resolvedWorkspaceId = await resolveWorkspaceId(workspaceKey);
      const workspaceKeys = Array.from(
        new Set([workspaceKey, resolvedWorkspaceId].filter(Boolean).map((value) => String(value))),
      );

      leaveRooms({
        workspaceKeys,
        projectId,
        taskId,
        userId: userId || socket.data?.auth?.userId || '',
        modules,
        entities,
      });

      socket.emit('workspace:left', {
        workspaceId: resolvedWorkspaceId || workspaceKey,
        workspaceKey,
        projectId: projectId || null,
        taskId: taskId || null,
        userId: userId || null,
        modules,
      });
    });

    socket.on('sync:request', ({ workspaceId, moduleName } = {}) => {
      socket.emit('sync:ack', {
        workspaceId,
        module: moduleName,
        at: new Date().toISOString(),
      });
    });

    socket.on('disconnect', () => {
      // no-op for now
    });
  });
}
