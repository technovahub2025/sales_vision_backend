import { mongoose, baseOptions, baseWorkspaceFields } from './_base.js';

const securityApiKeySchema = new mongoose.Schema(
  {
    ...baseWorkspaceFields,
    name: { type: String, required: true },
    tokenMasked: { type: String, required: true },
    lastUsedAt: { type: Date },
    revoked: { type: Boolean, default: false, index: true },
  },
  baseOptions,
);

securityApiKeySchema.index({ workspaceId: 1, revoked: 1, updatedAt: -1 });

export const SecurityApiKey = mongoose.model('SecurityApiKey', securityApiKeySchema, 'sv_security_api_keys');
