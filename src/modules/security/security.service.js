import { SecuritySession } from '../../models/securitySession.model.js';
import { SecurityApiKey } from '../../models/securityApiKey.model.js';
import { createRepository } from '../../repositories/createRepository.js';
import { appendActivity } from '../activity/activity.service.js';
import { emitDomainEvent } from '../../sockets/emitters.js';

const sessionRepo = createRepository(SecuritySession);
const apiKeyRepo = createRepository(SecurityApiKey);

export const securityService = {
  listSessions: ({ workspaceId, query }) => sessionRepo.list({ workspaceId, query }),
  listApiKeys: ({ workspaceId, query }) => apiKeyRepo.list({ workspaceId, query }),

  async createSession({ workspaceId, data, io }) {
    const session = await sessionRepo.create({ workspaceId, data });
    await appendActivity({ workspaceId, module: 'security', action: 'created', entity: 'session', entityId: session._id, payload: session });
    emitDomainEvent(io, { workspaceId, moduleName: 'security', entity: 'security', action: 'updated', data: session });
    return session;
  },

  async updateSession({ workspaceId, id, data, io }) {
    const session = await sessionRepo.update({ workspaceId, id, data });
    if (!session) return null;
    await appendActivity({ workspaceId, module: 'security', action: 'updated', entity: 'session', entityId: session._id, payload: session });
    emitDomainEvent(io, { workspaceId, moduleName: 'security', entity: 'security', action: 'updated', data: session });
    return session;
  },

  async revokeSession({ workspaceId, id, io }) {
    return this.updateSession({ workspaceId, id, data: { revoked: true }, io });
  },

  async createApiKey({ workspaceId, data, io }) {
    const key = await apiKeyRepo.create({ workspaceId, data });
    await appendActivity({ workspaceId, module: 'security', action: 'created', entity: 'api_key', entityId: key._id, payload: key });
    emitDomainEvent(io, { workspaceId, moduleName: 'security', entity: 'security', action: 'updated', data: key });
    return key;
  },

  async updateApiKey({ workspaceId, id, data, io }) {
    const key = await apiKeyRepo.update({ workspaceId, id, data });
    if (!key) return null;
    await appendActivity({ workspaceId, module: 'security', action: 'updated', entity: 'api_key', entityId: key._id, payload: key });
    emitDomainEvent(io, { workspaceId, moduleName: 'security', entity: 'security', action: 'updated', data: key });
    return key;
  },

  async removeApiKey({ workspaceId, id, io }) {
    const removed = await apiKeyRepo.remove({ workspaceId, id });
    if (!removed) return null;
    await appendActivity({ workspaceId, module: 'security', action: 'deleted', entity: 'api_key', entityId: removed._id, payload: removed });
    emitDomainEvent(io, { workspaceId, moduleName: 'security', entity: 'security', action: 'updated', data: removed });
    return removed;
  },
};
