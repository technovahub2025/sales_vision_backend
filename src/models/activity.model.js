import { mongoose, baseOptions, baseWorkspaceFields } from './_base.js';

const activitySchema = new mongoose.Schema(
  {
    ...baseWorkspaceFields,
    actor: { type: String, default: 'workspace-actor' },
    module: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    entity: { type: String, required: true, index: true },
    entityId: { type: String, required: true },
    message: { type: String, default: '' },
    payload: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    occurredAt: { type: Date, default: Date.now, index: true },
  },
  baseOptions,
);

activitySchema.index({ workspaceId: 1, occurredAt: -1 });

export const Activity = mongoose.model('Activity', activitySchema, 'sv_activity');
