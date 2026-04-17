import mongoose from 'mongoose';

const sprintSchema = new mongoose.Schema(
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
    name: { type: String, required: true, trim: true },
    goal: { type: String, default: '' },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['planning', 'active', 'completed'], default: 'planning', index: true },
    capacity: { type: Number, default: 0 },
  },
  { timestamps: true },
);

sprintSchema.index({ workspaceId: 1, projectId: 1, status: 1, startDate: 1 });
sprintSchema.index({ workspaceId: 1, projectId: 1, endDate: -1 });

export const Sprint = mongoose.model('Sprint', sprintSchema, 'sv_sprints');
