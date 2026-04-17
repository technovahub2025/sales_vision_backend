import mongoose from 'mongoose';

const workflowStatusSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    workflowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workflow',
      required: true,
      index: true,
    },
    key: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
      index: true,
    },
    color: {
      type: String,
      default: '#64748B',
      trim: true,
    },
    isFinal: {
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

workflowStatusSchema.index({ workspaceId: 1, workflowId: 1, order: 1 });
workflowStatusSchema.index({ workspaceId: 1, workflowId: 1, key: 1 }, { unique: true });

export const WorkflowStatus = mongoose.model('WorkflowStatus', workflowStatusSchema, 'sv_workflow_status');
