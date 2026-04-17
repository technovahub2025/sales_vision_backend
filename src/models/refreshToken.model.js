import { mongoose } from './_base.js';

const refreshTokenSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: { type: String, required: true, index: true },
    familyId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    revokedAt: { type: Date, default: null, index: true },
    replacedByTokenHash: { type: String, default: null },
    expiresAt: { type: Date, required: true, index: true },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true },
);

refreshTokenSchema.index({ workspaceId: 1, userId: 1, expiresAt: -1 });
refreshTokenSchema.index({ familyId: 1, revokedAt: 1 });

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema, 'sv_refresh_tokens');
