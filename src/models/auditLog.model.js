import { mongoose } from './_base.js';

const auditLogSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    resource: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    resourceId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    ip: {
      type: String,
      default: '',
      trim: true,
    },
    userAgent: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ workspaceId: 1, createdAt: -1 });
auditLogSchema.index({ workspaceId: 1, action: 1, resource: 1, createdAt: -1 });
auditLogSchema.index({ workspaceId: 1, actorId: 1, createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema, 'sv_audit_logs');

