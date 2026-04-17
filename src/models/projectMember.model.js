import mongoose from 'mongoose';

const projectMemberSchema = new mongoose.Schema(
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
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['lead', 'member', 'viewer'],
      default: 'member',
      index: true,
    },
    joinedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

projectMemberSchema.index({ workspaceId: 1, projectId: 1, isActive: 1, role: 1 });
projectMemberSchema.index({ workspaceId: 1, userId: 1, isActive: 1 });
projectMemberSchema.index({ workspaceId: 1, projectId: 1, userId: 1 }, { unique: true });

export const ProjectMember = mongoose.model('ProjectMember', projectMemberSchema, 'sv_project_members');
