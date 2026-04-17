import { mongoose } from './_base.js';

const workspaceInviteSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member', 'viewer'],
      default: 'member',
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    invitedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    acceptedAt: {
      type: Date,
      default: null,
      index: true,
    },
    acceptedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'revoked', 'expired'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true },
);

workspaceInviteSchema.index({ workspaceId: 1, email: 1, status: 1, createdAt: -1 });
workspaceInviteSchema.index({ workspaceId: 1, status: 1, expiresAt: 1 });

export const WorkspaceInvite = mongoose.model('WorkspaceInvite', workspaceInviteSchema, 'sv_workspace_invites');
