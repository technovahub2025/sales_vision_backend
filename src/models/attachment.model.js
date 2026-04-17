import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    entityType: {
      type: String,
      enum: ['task', 'lead', 'comment', 'project', 'employee', 'user'],
      required: true,
      index: true,
    },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    url: { type: String, required: true },
    secureUrl: { type: String, default: '' },
    publicId: { type: String, required: true, index: true },
    mimeType: { type: String, required: true },
    size: { type: Number, default: 0 },
    originalName: { type: String, default: '' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

// All attachments for entity X
attachmentSchema.index({ workspaceId: 1, entityType: 1, entityId: 1, uploadedAt: -1 });
// My uploads
attachmentSchema.index({ workspaceId: 1, uploadedBy: 1, uploadedAt: -1 });

export const Attachment = mongoose.model('Attachment', attachmentSchema, 'sv_attachments');
