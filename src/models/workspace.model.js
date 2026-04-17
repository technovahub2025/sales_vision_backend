import mongoose from 'mongoose';

const workspaceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    logo: { type: String, default: '' },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    plan: {
      type: String,
      default: 'starter',
      index: true,
    },
    timezone: {
      type: String,
      default: 'UTC',
      index: true,
    },
    settings: {
      timezone: { type: String, default: 'UTC' },
      dateFormat: { type: String, default: 'MMM DD, YYYY' },
    },
  },
  { timestamps: true },
);

workspaceSchema.index({ ownerId: 1, createdAt: -1 });

export const Workspace = mongoose.model('Workspace', workspaceSchema, 'sv_workspaces');
