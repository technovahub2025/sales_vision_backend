import mongoose from 'mongoose';

const labelSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    color: { type: String, default: '#64748b' },
  },
  { timestamps: true },
);

labelSchema.index({ workspaceId: 1, name: 1 }, { unique: true });

export const Label = mongoose.model('Label', labelSchema, 'sv_labels');
