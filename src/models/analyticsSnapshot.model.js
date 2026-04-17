import { mongoose, baseOptions, baseWorkspaceFields } from './_base.js';

const analyticsSnapshotSchema = new mongoose.Schema(
  {
    ...baseWorkspaceFields,
    periodKey: { type: String, required: true, index: true },
    metrics: { type: Map, of: Number, default: {} },
    aggregates: { type: Map, of: Number, default: {} },
  },
  baseOptions,
);

analyticsSnapshotSchema.index({ workspaceId: 1, periodKey: 1 }, { unique: true });

export const AnalyticsSnapshot = mongoose.model('AnalyticsSnapshot', analyticsSnapshotSchema, 'sv_analytics_snapshots');
