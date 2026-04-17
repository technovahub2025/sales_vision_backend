import { mongoose, baseOptions, baseWorkspaceFields } from './_base.js';

const noteSchema = new mongoose.Schema(
  {
    body: { type: String, required: true },
    createdBy: { type: String, default: 'workspace-actor' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const clientSchema = new mongoose.Schema(
  {
    ...baseWorkspaceFields,
    name: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    company: { type: String, default: '', trim: true },
    industry: { type: String, default: '', trim: true },
    website: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    contactName: { type: String, default: '', trim: true },
    designation: { type: String, default: '', trim: true },
    alternatePhone: { type: String, default: '', trim: true },
    taxId: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    state: { type: String, default: '', trim: true },
    country: { type: String, default: '', trim: true },
    pincode: { type: String, default: '', trim: true },
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },
    tags: [{ type: String, trim: true }],
    notes: { type: [noteSchema], default: [] },
    status: {
      type: String,
      enum: ['active', 'inactive', 'prospect'],
      default: 'prospect',
      index: true,
    },
    isArchived: { type: Boolean, default: false, index: true },
  },
  baseOptions,
);

clientSchema.index({ workspaceId: 1, status: 1 });
clientSchema.index({ workspaceId: 1, assigneeId: 1 });
clientSchema.index({ workspaceId: 1, updatedAt: -1 });

export const Client = mongoose.model('Client', clientSchema, 'sv_clients');
