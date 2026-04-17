import mongoose from 'mongoose';

const mentionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, default: '' },
  },
  { _id: false },
);

const commentAttachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    filename: { type: String, required: true },
    size: { type: Number, default: 0 },
  },
  { _id: false },
);

const commentSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    entityType: { type: String, enum: ['task', 'lead'], required: true, index: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, required: true, maxlength: 4000, trim: true },
    mentions: { type: [mentionSchema], default: [] },
    attachments: { type: [commentAttachmentSchema], default: [] },
    editedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

commentSchema.index({ workspaceId: 1, entityType: 1, entityId: 1, createdAt: 1 });
commentSchema.index({ workspaceId: 1, authorId: 1, createdAt: -1 });

export const Comment = mongoose.model('Comment', commentSchema, 'sv_comments');
