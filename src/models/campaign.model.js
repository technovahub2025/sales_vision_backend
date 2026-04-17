import { mongoose, baseOptions, baseWorkspaceFields } from './_base.js';

const campaignSchema = new mongoose.Schema(
  {
    ...baseWorkspaceFields,
    name: { type: String, required: true, trim: true },
    subtitle: { type: String, default: '' },
    status: {
      type: String,
      enum: ['draft', 'active', 'paused', 'completed'],
      default: 'draft',
      index: true,
    },
    channel: { type: String, default: '', index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    lead: { type: String, default: '' },
    owner: { type: String, default: '' },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    performance: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0, min: 0 },
    budget: { type: Number, default: 0 },
    spend: { type: Number, default: 0 },
    roi: { type: Number, default: 0 },
    startDate: { type: Date, default: null, index: true },
    endDate: { type: Date, default: null, index: true },
    targetAudience: { type: String, default: '' },
    goalType: { type: String, default: '' },
    goalValue: { type: Number, default: 0 },
    utmSource: { type: String, default: '' },
    utmMedium: { type: String, default: '' },
    utmCampaign: { type: String, default: '' },
    notes: { type: String, default: '' },
    leadIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lead' }],
    clientIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Client' }],
    lastActivityAt: { type: Date, default: null, index: true },
    isArchived: { type: Boolean, default: false, index: true },
  },
  baseOptions,
);

campaignSchema.index({ workspaceId: 1, isArchived: 1, status: 1, updatedAt: -1 });
campaignSchema.index({ workspaceId: 1, channel: 1, status: 1, updatedAt: -1 });
campaignSchema.index({ workspaceId: 1, ownerId: 1, updatedAt: -1 });

export const Campaign = mongoose.model('Campaign', campaignSchema, 'sv_campaigns');
