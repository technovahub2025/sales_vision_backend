import mongoose from 'mongoose';

const baseOptions = { timestamps: true };

export const baseWorkspaceFields = {
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true,
  },
};

export { mongoose, baseOptions };
