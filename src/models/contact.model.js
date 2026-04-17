import { mongoose, baseOptions, baseWorkspaceFields } from './_base.js';

const contactSchema = new mongoose.Schema(
  {
    ...baseWorkspaceFields,
    name: { type: String, required: true, trim: true },
    company: { type: String, default: '' },
    role: { type: String, default: '' },
    department: { type: String, default: '' },
    email: { type: String, default: '', index: true },
    phone: { type: String, default: '' },
    website: { type: String, default: '' },
    address: { type: String, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    project: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null, index: true },
    customFields: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  baseOptions,
);

contactSchema.index({ workspaceId: 1, updatedAt: -1 });
contactSchema.index({ workspaceId: 1, email: 1 });
contactSchema.index({ workspaceId: 1, employeeId: 1 }, { sparse: true });

export const Contact = mongoose.model('Contact', contactSchema, 'sv_contacts');
