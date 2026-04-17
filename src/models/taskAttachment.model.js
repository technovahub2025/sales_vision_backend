import mongoose from 'mongoose';

const taskAttachmentSchema = new mongoose.Schema(
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
    fileName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    size: { type: Number, required: true, min: 0 },
    label: { type: String, default: '', trim: true },
    referenceKey: { type: String, default: '', trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

taskAttachmentSchema.index({ workspaceId: 1, taskId: 1, createdAt: -1 });

export const TaskAttachment = mongoose.model('TaskAttachment', taskAttachmentSchema, 'sv_task_attachments');
