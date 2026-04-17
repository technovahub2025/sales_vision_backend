import { mongoose, baseOptions, baseWorkspaceFields } from './_base.js';

const taskOrderSchema = new mongoose.Schema(
  {
    ...baseWorkspaceFields,
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },
    groupKey: {
      type: String,
      default: 'all',
      index: true,
    },
    order: { type: Number, required: true, default: 0 },
  },
  baseOptions,
);

taskOrderSchema.index({ userId: 1, workspaceId: 1 });
taskOrderSchema.index({ userId: 1, workspaceId: 1, taskId: 1, groupKey: 1 }, { unique: true });

export const TaskOrder = mongoose.model('TaskOrder', taskOrderSchema, 'sv_task_order');
