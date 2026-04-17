import mongoose from 'mongoose';

const workflowSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    entityType: {
      type: String,
      enum: ['task', 'lead'],
      default: 'task',
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

workflowSchema.index({ workspaceId: 1, entityType: 1, isDefault: 1 });
workflowSchema.index({ workspaceId: 1, entityType: 1, name: 1 }, { unique: true });

export const Workflow = mongoose.model('Workflow', workflowSchema, 'sv_workflow');
