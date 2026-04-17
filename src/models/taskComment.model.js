import mongoose from 'mongoose';

const taskCommentSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    type: {
      type: String,
      enum: ['comment', 'system'],
      default: 'comment',
    },
    body: { type: String, required: true, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

taskCommentSchema.index({ workspaceId: 1, taskId: 1, createdAt: -1 });

export const TaskComment = mongoose.model('TaskComment', taskCommentSchema, 'sv_task_comments');
