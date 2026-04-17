import { mongoose, baseOptions, baseWorkspaceFields } from './_base.js';

const settingPreferenceSchema = new mongoose.Schema(
  {
    ...baseWorkspaceFields,
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    theme: { type: String, default: 'light' },
    timezone: { type: String, default: 'UTC' },
    language: { type: String, default: 'en' },
    notifications: { type: Map, of: Boolean, default: {} },
  },
  baseOptions,
);

settingPreferenceSchema.index({ workspaceId: 1 }, { unique: true });

export const SettingPreference = mongoose.model('SettingPreference', settingPreferenceSchema, 'sv_setting_preferences');
