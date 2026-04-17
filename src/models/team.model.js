import mongoose from 'mongoose';

const teamSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    memberIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    color: { type: String, default: '#64748b' },
    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

teamSchema.index({ workspaceId: 1, isArchived: 1, updatedAt: -1 });
teamSchema.index({ workspaceId: 1, leadId: 1, isArchived: 1 });

export const Team = mongoose.model('Team', teamSchema, 'sv_teams');
