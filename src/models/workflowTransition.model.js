import mongoose from 'mongoose';

const workflowTransitionSchema = new mongoose.Schema(
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
    fromStatusId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkflowStatus',
      required: true,
      index: true,
    },
    toStatusId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkflowStatus',
      required: true,
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

workflowTransitionSchema.index({ workspaceId: 1, workflowId: 1, fromStatusId: 1, toStatusId: 1 }, { unique: true });

export const WorkflowTransition = mongoose.model('WorkflowTransition', workflowTransitionSchema, 'sv_workflow_transition');
