import { mongoose, baseOptions, baseWorkspaceFields } from './_base.js';

const settingProfileSchema = new mongoose.Schema(
  {
    ...baseWorkspaceFields,
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    name: { type: String, default: '' },
    title: { type: String, default: '' },
    email: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
  },
  baseOptions,
);

settingProfileSchema.index({ workspaceId: 1 }, { unique: true });

export const SettingProfile = mongoose.model('SettingProfile', settingProfileSchema, 'sv_setting_profiles');
