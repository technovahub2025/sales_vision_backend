import { mongoose } from './_base.js';

const workspaceMemberSchema = new mongoose.Schema(
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
    role: {
      type: String,
      enum: ['owner', 'admin', 'member', 'viewer'],
      default: 'member',
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'invited', 'suspended'],
      default: 'active',
      index: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    invitedEmail: {
      type: String,
      default: '',
      lowercase: true,
      trim: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
workspaceMemberSchema.index({ workspaceId: 1, role: 1, status: 1 });
workspaceMemberSchema.index({ userId: 1, status: 1 });

export const WorkspaceMember = mongoose.model('WorkspaceMember', workspaceMemberSchema, 'sv_workspace_members');
