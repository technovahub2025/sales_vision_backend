import { mongoose } from './_base.js';

const passwordResetTokenSchema = new mongoose.Schema(
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
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

passwordResetTokenSchema.index({ workspaceId: 1, userId: 1, createdAt: -1 });

export const PasswordResetToken = mongoose.model('PasswordResetToken', passwordResetTokenSchema, 'sv_password_reset_tokens');
