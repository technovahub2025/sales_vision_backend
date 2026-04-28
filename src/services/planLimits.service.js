import { Workspace } from '../models/workspace.model.js';
import { WorkspaceMember } from '../models/workspaceMember.model.js';
import { Attachment } from '../models/attachment.model.js';
import { TaskAttachment } from '../models/taskAttachment.model.js';

export const WORKSPACE_PLANS = {
  free: 'free',
  pro: 'pro',
};

export const FREE_PLAN_LIMITS = {
  maxMembers: 10,
  maxStorageBytes: 2 * 1024 * 1024 * 1024,
};

const PLAN_FEATURES = {
  roadmap: [WORKSPACE_PLANS.pro],
  auditLog: [WORKSPACE_PLANS.pro],
};

function normalizePlan(plan) {
  const safe = String(plan || '').toLowerCase();
  return safe === WORKSPACE_PLANS.pro ? WORKSPACE_PLANS.pro : WORKSPACE_PLANS.free;
}

async function getWorkspacePlan(workspaceId) {
  const workspace = await Workspace.findById(workspaceId, { plan: 1 }).lean();
  return normalizePlan(workspace?.plan);
}

async function getActiveMemberCount(workspaceId) {
  return WorkspaceMember.countDocuments({ workspaceId, status: 'active' });
}

async function getStorageUsedBytes(workspaceId) {
  const [attachmentAgg, taskAttachmentAgg] = await Promise.all([
    Attachment.aggregate([
      { $match: { workspaceId } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$size', 0] } } } },
    ]),
    TaskAttachment.aggregate([
      { $match: { workspaceId } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$size', 0] } } } },
    ]),
  ]);

  const a = Number(attachmentAgg?.[0]?.total || 0);
  const b = Number(taskAttachmentAgg?.[0]?.total || 0);
  return a + b;
}

export const planLimitsService = {
  normalizePlan,
  getWorkspacePlan,
  async getUsageSnapshot(workspaceId) {
    const [memberCount, storageUsedBytes] = await Promise.all([
      getActiveMemberCount(workspaceId),
      getStorageUsedBytes(workspaceId),
    ]);
    return { memberCount, storageUsedBytes };
  },
  async ensureFeatureAllowed(workspaceId, featureKey) {
    const plan = await getWorkspacePlan(workspaceId);
    const allowedPlans = PLAN_FEATURES[featureKey] || [WORKSPACE_PLANS.free, WORKSPACE_PLANS.pro];
    const allowed = allowedPlans.includes(plan);
    if (allowed) return { allowed: true, plan };
    return {
      allowed: false,
      plan,
      code: 'PLAN_RESTRICTED',
      message: `This feature is available only on Pro plan.`,
      details: { featureKey, plan },
    };
  },
  async ensureMemberCapacity(workspaceId, additionalMembers = 1) {
    const plan = await getWorkspacePlan(workspaceId);
    const usage = await getActiveMemberCount(workspaceId);
    if (plan === WORKSPACE_PLANS.pro) {
      return { allowed: true, plan, current: usage, max: null };
    }
    const projected = usage + Math.max(Number(additionalMembers) || 0, 0);
    if (projected <= FREE_PLAN_LIMITS.maxMembers) {
      return { allowed: true, plan, current: usage, max: FREE_PLAN_LIMITS.maxMembers };
    }
    return {
      allowed: false,
      plan,
      code: 'PLAN_LIMIT_REACHED',
      message: `Free plan allows up to ${FREE_PLAN_LIMITS.maxMembers} active members.`,
      details: {
        limitKey: 'maxMembers',
        current: usage,
        max: FREE_PLAN_LIMITS.maxMembers,
      },
    };
  },
  async ensureStorageCapacity(workspaceId, incomingBytes = 0) {
    const plan = await getWorkspacePlan(workspaceId);
    const usage = await getStorageUsedBytes(workspaceId);
    if (plan === WORKSPACE_PLANS.pro) {
      return { allowed: true, plan, current: usage, max: null };
    }
    const projected = usage + Math.max(Number(incomingBytes) || 0, 0);
    if (projected <= FREE_PLAN_LIMITS.maxStorageBytes) {
      return { allowed: true, plan, current: usage, max: FREE_PLAN_LIMITS.maxStorageBytes };
    }
    return {
      allowed: false,
      plan,
      code: 'PLAN_LIMIT_REACHED',
      message: 'Free plan storage limit reached (2GB).',
      details: {
        limitKey: 'maxStorageBytes',
        current: usage,
        max: FREE_PLAN_LIMITS.maxStorageBytes,
      },
    };
  },
};
