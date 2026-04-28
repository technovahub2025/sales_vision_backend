import mongoose from 'mongoose';

const boardColumnSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    order: { type: Number, required: true },
    colorMeta: { type: String, default: '' },
    isDoneColumn: { type: Boolean, default: false },
    wipLimit: { type: Number, default: null },
  },
  { _id: false },
);

const boardViewSchema = new mongoose.Schema(
  {
    filter: {
      priority: { type: String, default: 'all' },
      assigneeId: { type: String, default: 'all' },
      query: { type: String, default: '' },
    },
    sort: {
      by: { type: String, default: 'position' },
      direction: { type: String, default: 'asc' },
    },
  },
  { _id: false },
);

const projectSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    status: { type: String, default: 'active', trim: true },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', index: true },
    startDate: { type: Date },
    endDate: { type: Date },
    metadata: {
      type: Map,
      of: String,
      default: {},
    },
    boardConfig: {
      columns: {
        type: [boardColumnSchema],
        default: undefined,
      },
      view: {
        type: boardViewSchema,
        default: () => ({}),
      },
    },
  },
  { timestamps: true },
);

projectSchema.index({ workspaceId: 1, updatedAt: -1 });
projectSchema.index({ workspaceId: 1, createdAt: -1 });
projectSchema.index({ workspaceId: 1, status: 1, updatedAt: -1 });
projectSchema.index({ workspaceId: 1, teamId: 1, updatedAt: -1 });
projectSchema.index({ workspaceId: 1, clientId: 1, updatedAt: -1 });
projectSchema.index({ workspaceId: 1, 'boardConfig.columns.key': 1 });

export const Project = mongoose.model('Project', projectSchema, 'sv_projects');
