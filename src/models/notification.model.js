import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['task_assigned', 'task_due_soon', 'mention', 'comment', 'lead_assigned', 'sprint_started', 'approval_needed'],
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    entityType: { type: String, default: '' },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ workspaceId: 1, userId: 1, read: 1, createdAt: -1 });

notificationSchema.virtual('isRead').get(function getIsRead() {
  return this.read;
});

export const Notification = mongoose.model('Notification', notificationSchema, 'sv_notifications');
