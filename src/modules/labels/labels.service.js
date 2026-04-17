import { Label } from '../../models/label.model.js';
import { appendActivity } from '../activity/activity.service.js';
import { emitDomainEvent } from '../../sockets/emitters.js';

export const labelsService = {
  async list({ workspaceId }) {
    const items = await Label.find({ workspaceId }, { name: 1, color: 1, updatedAt: 1 })
      .sort({ updatedAt: -1 })
      .lean();
    return { items, meta: { total: items.length } };
  },

  async create({ workspaceId, data, io }) {
    const created = await Label.create({
      workspaceId,
      name: String(data?.name || '').trim(),
      color: String(data?.color || '#64748b'),
    });
    const item = created.toObject();
    await appendActivity({
      workspaceId,
      module: 'labels',
      action: 'created',
      entity: 'label',
      entityId: item._id,
      payload: item,
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'labels', entity: 'label', action: 'created', data: item });
    return item;
  },

  async remove({ workspaceId, id, io }) {
    const item = await Label.findOneAndDelete({ workspaceId, _id: id }, { name: 1, color: 1 }).lean();
    if (!item) return null;
    await appendActivity({
      workspaceId,
      module: 'labels',
      action: 'deleted',
      entity: 'label',
      entityId: id,
      payload: item,
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'labels', entity: 'label', action: 'deleted', data: item });
    return item;
  },
};
