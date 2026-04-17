import { mongoose, baseOptions, baseWorkspaceFields } from './_base.js';

const leadSchema = new mongoose.Schema(
  {
    ...baseWorkspaceFields,
    title: { type: String, required: true, trim: true },
    stage: { type: String, default: 'new', index: true },
    workflowId: { type: String, default: 'default-lead-pipeline', index: true },
    statusId: { type: String, default: 'new', index: true },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', index: true },
    value: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    source: {
      type: String,
      enum: ['organic', 'referral', 'cold', 'paid', 'event'],
      default: 'organic',
      index: true,
    },
    priority: {
      type: String,
      enum: ['hot', 'warm', 'cold'],
      default: 'warm',
      index: true,
    },
    expectedCloseDate: { type: Date, index: true },
    tags: [{ type: String, trim: true }],
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    attachments: [
      {
        url: { type: String, required: true },
        filename: { type: String, required: true },
        size: { type: Number, default: 0 },
        mimeType: { type: String, default: '' },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    notes: [
      {
        _id: false,
        body: { type: String, required: true },
        createdBy: { type: String, default: 'workspace-actor' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    nextFollowUp: { type: Date, index: true },
    owner: { type: String, default: '' },
    health: { type: String, default: 'healthy' },
    dueDate: { type: Date },
    isArchived: { type: Boolean, default: false, index: true },
  },
  baseOptions,
);

leadSchema.index({ workspaceId: 1, isArchived: 1, statusId: 1, updatedAt: -1 });
leadSchema.index({ workspaceId: 1, assigneeId: 1, statusId: 1, updatedAt: -1 });
leadSchema.index({ workspaceId: 1, clientId: 1, updatedAt: -1 });
leadSchema.index({ workspaceId: 1, source: 1, priority: 1, expectedCloseDate: 1 });

export const Lead = mongoose.model('Lead', leadSchema, 'sv_leads');
