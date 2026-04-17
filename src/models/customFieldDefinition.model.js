import mongoose from 'mongoose';

const customFieldDefinitionSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    entityType: { type: String, enum: ['task', 'lead'], required: true, index: true },
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['text', 'number', 'date', 'select', 'multiselect', 'checkbox', 'url'],
      required: true,
    },
    options: [{ type: String, trim: true }],
    isRequired: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

customFieldDefinitionSchema.index({ workspaceId: 1, entityType: 1, order: 1 });
customFieldDefinitionSchema.index({ workspaceId: 1, entityType: 1, key: 1 }, { unique: true });

export const CustomFieldDefinition = mongoose.model(
  'CustomFieldDefinition',
  customFieldDefinitionSchema,
  'sv_custom_field_definitions',
);
