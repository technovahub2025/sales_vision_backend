import { workspaceRoom, moduleRoom, entityRoom, taskRoom } from './rooms.js';

const pendingEvents = new Map();

/**
 * @param {unknown} input
 * @returns {string | null}
 */
function resolveEntityId(input) {
  if (!input) return null;
  if (typeof input === 'string') return input;
  if (typeof input === 'object') {
    const candidate = input._id || input.id || input.entityId || null;
    return candidate ? String(candidate) : null;
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function resolveTaskId(value) {
  if (!value || typeof value !== 'object') return null;
  return value.taskId ? String(value.taskId) : null;
}

/**
 * @param {{ workspaceId: string, moduleName: string, entity: string, action: string, data: any }} args
 */
function buildPayload({ workspaceId, moduleName, entity, action, data }) {
  const entityId = resolveEntityId(data);
  const version = data?.updatedAt ? new Date(data.updatedAt).getTime() : Date.now();
  const timestamp =
    data?.updatedAt && !Number.isNaN(new Date(data.updatedAt).getTime())
      ? new Date(data.updatedAt).toISOString()
      : new Date().toISOString();

  const payload = {
    // Unified realtime contract.
    event: `${entity}:${action}`,
    workspaceId,
    entity,
    entityId,
    version,
    ts: timestamp,
    eventId: `${workspaceId}:${entity}:${entityId || 'na'}:${version}`,
    payload: data,
    // Compatibility fields retained during transition.
    moduleName,
    action,
    data,
    entityType: entity,
    changeType: action,
    changedBy: data?.updatedBy || data?.actorId || null,
    timestamp,
    diff: data?.diff || null,
    meta: { version, at: timestamp },
  };

  if (entity && data && typeof data === 'object') {
    payload[entity] = data;
  }
  if (entity === 'task') {
    payload.task = data;
  }
  if (entity === 'comment') {
    payload.comment = data;
  }

  return payload;
}

/**
 * @param {import('socket.io').Server} io
 * @param {{ workspaceId: string, moduleName: string, entity: string, action: string, data: any }} event
 */
export function emitDomainEvent(io, event) {
  const { workspaceId, moduleName, entity, action, data } = event;
  const payload = buildPayload(event);

  io.to(workspaceRoom(workspaceId)).emit('realtime:event', payload);
  io.to(workspaceRoom(workspaceId)).emit(`${entity}:${action}`, payload);
  io.to(moduleRoom(workspaceId, moduleName)).emit(`${moduleName}:updated`, payload);

  const id = resolveEntityId(data);
  if (id) {
    io.to(entityRoom(workspaceId, moduleName, id)).emit(`${entity}:entity`, payload);
  }

  if (entity === 'task' && id) {
    io.to(taskRoom(id)).emit(`${entity}:${action}`, payload);
  }

  const commentTaskId = entity === 'comment' ? resolveTaskId(data) : null;
  if (commentTaskId) {
    io.to(taskRoom(commentTaskId)).emit('comment:added', payload);
  }

  // Backward-compatible alias while introducing the new "comment:added" event.
  if (entity === 'comment' && action === 'created') {
    io.to(workspaceRoom(workspaceId)).emit('comment:added', payload);
  }
}

/**
 * @param {import('socket.io').Server} io
 * @param {string} key
 * @param {() => void} callback
 * @param {number} [delayMs]
 */
export function emitCoalesced(io, key, callback, delayMs = 120) {
  const existing = pendingEvents.get(key);
  if (existing) {
    clearTimeout(existing);
  }

  const handle = setTimeout(() => {
    pendingEvents.delete(key);
    callback();
  }, delayMs);

  pendingEvents.set(key, handle);
}
