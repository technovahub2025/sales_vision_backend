import { mongoose, baseOptions, baseWorkspaceFields } from './_base.js';

const employeeSchema = new mongoose.Schema(
  {
    ...baseWorkspaceFields,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null, index: true },
    name: { type: String, required: true },
    email: { type: String, default: '', index: true },
    role: { type: String, default: '', index: true },
    department: { type: String, default: '', index: true },
    designation: { type: String, default: '' },
    skills: [{ type: String, trim: true }],
    phone: { type: String, default: '' },
    bio: { type: String, default: '' },
    avatar: { type: String, default: '' },
    capacity: {
      hoursPerWeek: { type: Number, default: 40 },
    },
    availability: {
      status: { type: String, enum: ['available', 'busy', 'ooo', 'leave'], default: 'available', index: true },
      until: { type: Date, default: null },
    },
    joinedAt: { type: Date, default: Date.now },
    employeeCode: { type: String, default: '', index: true },
    manager: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
      name: { type: String, default: '' },
    },
    teamIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
    team: { type: String, default: 'General', index: true },
    velocity: { type: Number, default: 0 },
    status: { type: String, default: 'active', index: true },
    task: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
  },
  baseOptions,
);

employeeSchema.index({ workspaceId: 1, team: 1, updatedAt: -1 });
employeeSchema.index({ workspaceId: 1, department: 1, role: 1, updatedAt: -1 });
employeeSchema.index({ workspaceId: 1, 'availability.status': 1, updatedAt: -1 });
employeeSchema.index({ workspaceId: 1, userId: 1 }, { sparse: true });
employeeSchema.index({ workspaceId: 1, contactId: 1 }, { sparse: true });

export const Employee = mongoose.model('Employee', employeeSchema, 'sv_employees');
