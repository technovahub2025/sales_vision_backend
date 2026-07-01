import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    workflowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow', default: null, index: true },
    statusId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkflowStatus', default: null, index: true },
    parentTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null, index: true },
    issueType: {
      type: String,
      enum: ['epic', 'task', 'subtask'],
      default: 'task',
      index: true,
    },
    sprintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sprint', default: null, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    priority: { type: String, default: 'medium' },
    archived: { type: Boolean, default: false, index: true },
    primaryAssigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      default: 'todo',
      index: true,
    },
    position: { type: Number, default: 0, index: true },
    dueDate: { type: Date },
    points: { type: Number, default: 0 },
    estimateHours: { type: Number, default: 0 },
    assigneeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    externalCollaborators: [
      {
        entityType: {
          type: String,
          enum: ['contact', 'employee'],
          required: true,
        },
        entityId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
      },
    ],
    tags: [{ type: String, trim: true }],
    labelIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Label' }],
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
    backlogOrder: { type: Number, default: 0, index: true },
    approval: {
      required: { type: Boolean, default: false },
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      approvedAt: { type: Date, default: null },
      status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    },
    clientRequestId: { type: String, trim: true },
    activityCount: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    totalTimeLogged: { type: Number, default: 0 },
  },
  { timestamps: true },
);

taskSchema.index({ workspaceId: 1, projectId: 1, status: 1 });
taskSchema.index({ workspaceId: 1, projectId: 1, status: 1, position: 1 });
taskSchema.index({ workspaceId: 1, updatedAt: -1 });
taskSchema.index({ workspaceId: 1, projectId: 1, updatedAt: -1 });
taskSchema.index({ workspaceId: 1, priority: 1, updatedAt: -1 });
taskSchema.index(
  { workspaceId: 1, clientRequestId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientRequestId: { $exists: true, $type: 'string' } },
  },
);
taskSchema.index({ workspaceId: 1, status: 1, priority: 1, dueDate: 1, updatedAt: -1 });
taskSchema.index({ workspaceId: 1, parentTaskId: 1, updatedAt: -1 });
taskSchema.index({ workspaceId: 1, issueType: 1, updatedAt: -1 });
taskSchema.index({ workspaceId: 1, sprintId: 1, backlogOrder: 1, priority: 1 });
taskSchema.index({ workspaceId: 1, 'approval.status': 1, updatedAt: -1 });

export const Task = mongoose.model('Task', taskSchema, 'sv_tasks');

export async function ensureTaskIndexes() {
  const targetKey = { workspaceId: 1, clientRequestId: 1 };
  const targetPartialFilterExpression = { clientRequestId: { $exists: true, $type: 'string' } };
  const indexes = await Task.collection.indexes();
  const legacyIndex = indexes.find((index) => {
    const key = JSON.stringify(index.key || {});
    const partial = JSON.stringify(index.partialFilterExpression || null);
    const targetPartial = JSON.stringify(targetPartialFilterExpression);
    return key === JSON.stringify(targetKey) && index.unique && partial !== targetPartial;
  });

  if (legacyIndex?.name) {
    await Task.collection.dropIndex(legacyIndex.name);
  }

  await Task.createIndexes();
}
