import mongoose from 'mongoose';

const superAdminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, default: 'Super Admin', trim: true },
    isActive: { type: Boolean, default: true, index: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const SuperAdmin = mongoose.model('SuperAdmin', superAdminSchema, 'sv_super_admins');
