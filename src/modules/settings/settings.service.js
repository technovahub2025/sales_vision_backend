import { SettingProfile } from '../../models/settingProfile.model.js';
import { SettingPreference } from '../../models/settingPreference.model.js';
import { Workspace } from '../../models/workspace.model.js';
import { appendActivity } from '../activity/activity.service.js';
import { emitDomainEvent } from '../../sockets/emitters.js';

async function upsert(model, workspaceId, data) {
  return model.findOneAndUpdate({ workspaceId }, { $set: { ...data, workspaceId } }, { upsert: true, new: true }).lean();
}

export const settingsService = {
  getProfile: (workspaceId) => SettingProfile.findOne({ workspaceId }).lean(),
  getPreferences: (workspaceId) => SettingPreference.findOne({ workspaceId }).lean(),
  getWorkspace: (workspaceId) => Workspace.findById(workspaceId, { name: 1, slug: 1, settings: 1, updatedAt: 1 }).lean(),

  async updateProfile({ workspaceId, data, io }) {
    const profile = await upsert(SettingProfile, workspaceId, data);
    await appendActivity({ workspaceId, module: 'settings', action: 'updated', entity: 'settings_profile', entityId: profile._id, payload: profile });
    emitDomainEvent(io, { workspaceId, moduleName: 'settings', entity: 'settings', action: 'updated', data: profile });
    return profile;
  },

  async updatePreferences({ workspaceId, data, io }) {
    const preferences = await upsert(SettingPreference, workspaceId, data);
    await appendActivity({ workspaceId, module: 'settings', action: 'updated', entity: 'settings_preferences', entityId: preferences._id, payload: preferences });
    emitDomainEvent(io, { workspaceId, moduleName: 'settings', entity: 'settings', action: 'updated', data: preferences });
    return preferences;
  },

  async updateWorkspace({ workspaceId, data, io }) {
    const patch = {};
    if (data?.name !== undefined) {
      patch.name = String(data.name || '').trim();
      if (!patch.name) {
        const error = new Error('Workspace name is required');
        error.statusCode = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
      }
    }
    if (data?.settings !== undefined && data.settings && typeof data.settings === 'object') {
      patch.settings = data.settings;
    }

    const workspace = await Workspace.findOneAndUpdate(
      { _id: workspaceId },
      { $set: patch },
      { new: true, projection: { name: 1, slug: 1, settings: 1, updatedAt: 1 } },
    ).lean();

    await appendActivity({
      workspaceId,
      module: 'settings',
      action: 'workspace_updated',
      entity: 'workspace',
      entityId: workspaceId,
      payload: patch,
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'settings', entity: 'workspace', action: 'updated', data: workspace });

    return workspace;
  },
};
