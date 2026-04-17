import { mongoose, baseOptions, baseWorkspaceFields } from './_base.js';

const securitySessionSchema = new mongoose.Schema(
  {
    ...baseWorkspaceFields,
    device: { type: String, default: '' },
    location: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    lastActiveAt: { type: Date, default: Date.now, index: true },
    isCurrent: { type: Boolean, default: false },
    revoked: { type: Boolean, default: false, index: true },
  },
  baseOptions,
);

securitySessionSchema.index({ workspaceId: 1, revoked: 1, lastActiveAt: -1 });

export const SecuritySession = mongoose.model('SecuritySession', securitySessionSchema, 'sv_security_sessions');
