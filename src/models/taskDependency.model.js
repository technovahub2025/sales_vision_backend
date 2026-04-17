import mongoose from 'mongoose';

const taskDependencySchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },
    dependsOnTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['blocks', 'blocked_by', 'relates_to'],
      default: 'blocks',
      index: true,
    },
  },
  { timestamps: true },
);

taskDependencySchema.index({ workspaceId: 1, taskId: 1, type: 1 });
taskDependencySchema.index({ workspaceId: 1, dependsOnTaskId: 1, type: 1 });
taskDependencySchema.index({ workspaceId: 1, taskId: 1, dependsOnTaskId: 1, type: 1 }, { unique: true });

export const TaskDependency = mongoose.model('TaskDependency', taskDependencySchema, 'sv_task_dependencies');
