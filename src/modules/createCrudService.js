import { createRepository } from '../repositories/createRepository.js';
import { emitDomainEvent, emitCoalesced } from '../sockets/emitters.js';
import { appendActivity } from './activity/activity.service.js';
import { invalidateDashboardCache } from './dashboard/dashboard.service.js';

export function createCrudService({ model, moduleName, entityName }) {
  const repository = createRepository(model);

  return {
    list: ({ workspaceId, query }) => repository.list({ workspaceId, query }),
    getById: ({ workspaceId, id }) => repository.getById({ workspaceId, id }),

    async create({ workspaceId, data, io }) {
      const created = await repository.create({ workspaceId, data });
      await appendActivity({
        workspaceId,
        module: moduleName,
        action: 'created',
        entity: entityName,
        entityId: created._id,
        payload: created,
      });

      emitDomainEvent(io, { workspaceId, moduleName, entity: entityName, action: 'created', data: created });
      emitDomainEvent(io, { workspaceId, moduleName: 'activity', entity: 'activity', action: 'appended', data: { entity: entityName, action: 'created' } });
      emitCoalesced(io, `dashboard:${workspaceId}`, () => {
        emitDomainEvent(io, { workspaceId, moduleName: 'dashboard', entity: 'dashboard', action: 'updated', data: { workspaceId } });
      });
      if (moduleName === 'leads' || moduleName === 'timeLogs') {
        await invalidateDashboardCache({ workspaceId, io, trigger: `${moduleName}:updated` });
      }
      return created;
    },

    async update({ workspaceId, id, data, io }) {
      const updated = await repository.update({ workspaceId, id, data });
      if (!updated) {
        return null;
      }

      await appendActivity({
        workspaceId,
        module: moduleName,
        action: 'updated',
        entity: entityName,
        entityId: updated._id,
        payload: updated,
      });

      emitDomainEvent(io, { workspaceId, moduleName, entity: entityName, action: 'updated', data: updated });
      emitDomainEvent(io, { workspaceId, moduleName: 'activity', entity: 'activity', action: 'appended', data: { entity: entityName, action: 'updated' } });
      emitCoalesced(io, `dashboard:${workspaceId}`, () => {
        emitDomainEvent(io, { workspaceId, moduleName: 'dashboard', entity: 'dashboard', action: 'updated', data: { workspaceId } });
      });
      if (moduleName === 'leads' || moduleName === 'timeLogs') {
        await invalidateDashboardCache({ workspaceId, io, trigger: `${moduleName}:updated` });
      }
      return updated;
    },

    async remove({ workspaceId, id, io }) {
      const removed = await repository.remove({ workspaceId, id });
      if (!removed) {
        return null;
      }

      await appendActivity({
        workspaceId,
        module: moduleName,
        action: 'deleted',
        entity: entityName,
        entityId: removed._id,
        payload: removed,
      });

      emitDomainEvent(io, { workspaceId, moduleName, entity: entityName, action: 'deleted', data: removed });
      emitDomainEvent(io, { workspaceId, moduleName: 'activity', entity: 'activity', action: 'appended', data: { entity: entityName, action: 'deleted' } });
      emitCoalesced(io, `dashboard:${workspaceId}`, () => {
        emitDomainEvent(io, { workspaceId, moduleName: 'dashboard', entity: 'dashboard', action: 'updated', data: { workspaceId } });
      });
      if (moduleName === 'leads' || moduleName === 'timeLogs') {
        await invalidateDashboardCache({ workspaceId, io, trigger: `${moduleName}:updated` });
      }
      return removed;
    },
  };
}
