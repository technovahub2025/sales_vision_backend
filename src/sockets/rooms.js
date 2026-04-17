export function workspaceRoom(workspaceId) {
  return `workspace:${workspaceId}`;
}

export function moduleRoom(workspaceId, moduleName) {
  return `workspace:${workspaceId}:module:${moduleName}`;
}

export function entityRoom(workspaceId, moduleName, entityId) {
  return `workspace:${workspaceId}:module:${moduleName}:entity:${entityId}`;
}

export function projectRoom(workspaceId, projectId) {
  return `workspace:${workspaceId}:project:${projectId}`;
}

export function taskRoom(taskId) {
  return `task:${taskId}`;
}

export function userRoom(userId) {
  return `user:${userId}`;
}
