import { CustomFieldDefinition } from '../../models/customFieldDefinition.model.js';
import { appendActivity } from '../activity/activity.service.js';
import { emitDomainEvent } from '../../sockets/emitters.js';

function parsePage(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  return { page, limit, skip: (page - 1) * limit };
}

export async function validateCustomFields(entityType, customFields = {}, workspaceId) {
  if (!customFields || typeof customFields !== 'object') {
    return { valid: true };
  }
  const defs = await CustomFieldDefinition.find({ workspaceId, entityType }, { key: 1, type: 1, isRequired: 1, options: 1 }).lean();
  const defMap = new Map(defs.map((d) => [d.key, d]));

  for (const def of defs) {
    if (def.isRequired && (customFields[def.key] === undefined || customFields[def.key] === null || customFields[def.key] === '')) {
      return { valid: false, message: `Custom field ${def.key} is required` };
    }
  }

  for (const [key, value] of Object.entries(customFields)) {
    const def = defMap.get(key);
    if (!def) continue;
    if (def.type === 'number' && value !== null && Number.isNaN(Number(value))) {
      return { valid: false, message: `Custom field ${key} expects a number` };
    }
    if (def.type === 'checkbox' && value !== null && typeof value !== 'boolean') {
      return { valid: false, message: `Custom field ${key} expects boolean` };
    }
    if ((def.type === 'select' || def.type === 'multiselect') && Array.isArray(def.options) && def.options.length) {
      const values = def.type === 'multiselect' ? (Array.isArray(value) ? value : []) : [value];
      if (values.some((v) => !def.options.includes(String(v)))) {
        return { valid: false, message: `Custom field ${key} contains unsupported option` };
      }
    }
  }

  return { valid: true };
}

export const customFieldsService = {
  async list({ workspaceId, query = {} }) {
    const { page, limit, skip } = parsePage(query);
    const where = { workspaceId, ...(query.entityType ? { entityType: query.entityType } : {}) };
    const [items, total] = await Promise.all([
      CustomFieldDefinition.find(where, { entityType: 1, name: 1, key: 1, type: 1, options: 1, isRequired: 1, order: 1, updatedAt: 1 })
        .sort({ entityType: 1, order: 1, updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CustomFieldDefinition.countDocuments(where),
    ]);
    return { items, meta: { page, limit, total } };
  },

  async create({ workspaceId, data, io }) {
    const created = await CustomFieldDefinition.create({
      workspaceId,
      entityType: data.entityType,
      name: String(data.name || '').trim(),
      key: String(data.key || '').trim(),
      type: data.type,
      options: Array.isArray(data.options) ? data.options.map((item) => String(item)) : [],
      isRequired: Boolean(data.isRequired),
      order: Number(data.order || 0),
    });
    const item = created.toObject();
    await appendActivity({
      workspaceId,
      module: 'customFields',
      action: 'created',
      entity: 'custom_field',
      entityId: item._id,
      payload: item,
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'customFields', entity: 'custom_field', action: 'created', data: item });
    return item;
  },

  async update({ workspaceId, id, data, io }) {
    const updated = await CustomFieldDefinition.findOneAndUpdate(
      { workspaceId, _id: id },
      {
        $set: {
          ...(data.name !== undefined ? { name: String(data.name || '').trim() } : {}),
          ...(data.key !== undefined ? { key: String(data.key || '').trim() } : {}),
          ...(data.type !== undefined ? { type: data.type } : {}),
          ...(data.options !== undefined ? { options: Array.isArray(data.options) ? data.options.map((i) => String(i)) : [] } : {}),
          ...(data.isRequired !== undefined ? { isRequired: Boolean(data.isRequired) } : {}),
          ...(data.order !== undefined ? { order: Number(data.order || 0) } : {}),
        },
      },
      { new: true, projection: { entityType: 1, name: 1, key: 1, type: 1, options: 1, isRequired: 1, order: 1, updatedAt: 1 } },
    ).lean();
    if (!updated) return null;
    await appendActivity({
      workspaceId,
      module: 'customFields',
      action: 'updated',
      entity: 'custom_field',
      entityId: updated._id,
      payload: updated,
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'customFields', entity: 'custom_field', action: 'updated', data: updated });
    return updated;
  },
};
