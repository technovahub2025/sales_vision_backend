import { Activity } from '../../models/activity.model.js';

export async function appendActivity({ workspaceId, module, action, entity, entityId, message, payload }) {
  return Activity.create({
    workspaceId,
    actor: 'workspace-actor',
    module,
    action,
    entity,
    entityId: String(entityId),
    message: message || `${entity} ${action}`,
    payload: payload || {},
    occurredAt: new Date(),
  });
}
