import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    displayName: { type: String, required: true, trim: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, required: true, trim: true, default: 'member', index: true },
    avatarUrl: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    lastLoginAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

userSchema.index({ workspaceId: 1, email: 1 }, { unique: true });
userSchema.index({ workspaceId: 1, role: 1, isActive: 1 });

export const User = mongoose.model('User', userSchema, 'sv_users');
