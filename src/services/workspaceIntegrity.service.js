import mongoose from 'mongoose';
import { User } from '../models/user.model.js';
import { Workspace } from '../models/workspace.model.js';
import { WorkspaceMember } from '../models/workspaceMember.model.js';
import { normalizeRole } from '../utils/roles.js';

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
}

async function resolveWorkspaceRef(workspaceRef) {
  const raw = String(workspaceRef || '').trim();
  if (!raw) return null;

  if (mongoose.Types.ObjectId.isValid(raw)) {
    const byId = await Workspace.findById(raw, { _id: 1 }).lean();
    if (byId?._id) return byId._id;
  }

  const bySlug = await Workspace.findOne({ slug: raw }, { _id: 1 }).lean();
  return bySlug?._id || null;
}

/**
 * Repairs broken user/workspace links and missing memberships.
 * Safe to run repeatedly.
 */
export async function repairWorkspaceIntegrity({ dryRun = false, limit = 5000 } = {}) {
  const users = await User.find(
    { isActive: true },
    { _id: 1, workspaceId: 1, role: 1, email: 1 },
  )
    .sort({ _id: 1 })
    .limit(Math.max(1, Number(limit) || 5000))
    .lean();

  const stats = {
    scanned: users.length,
    workspaceNormalized: 0,
    membershipBackfilled: 0,
    workspaceRecoveredFromMembership: 0,
    unresolvedUsers: 0,
  };

  for (const user of users) {
    const userId = toObjectId(user?._id);
    if (!userId) continue;

    let targetWorkspaceId = await resolveWorkspaceRef(user?.workspaceId);

    if (!targetWorkspaceId) {
      const firstMembership = await WorkspaceMember.findOne(
        { userId, status: 'active' },
        { workspaceId: 1 },
      )
        .sort({ joinedAt: 1, createdAt: 1 })
        .lean();

      if (firstMembership?.workspaceId) {
        targetWorkspaceId = firstMembership.workspaceId;
        stats.workspaceRecoveredFromMembership += 1;
      }
    }

    if (!targetWorkspaceId) {
      stats.unresolvedUsers += 1;
      continue;
    }

    const currentWorkspaceId = toObjectId(user?.workspaceId);
    if (!currentWorkspaceId || String(currentWorkspaceId) !== String(targetWorkspaceId)) {
      if (!dryRun) {
        await User.updateOne({ _id: userId }, { $set: { workspaceId: targetWorkspaceId } });
      }
      stats.workspaceNormalized += 1;
    }

    const membership = await WorkspaceMember.findOne(
      { workspaceId: targetWorkspaceId, userId, status: 'active' },
      { _id: 1 },
    ).lean();

    if (!membership) {
      if (!dryRun) {
        await WorkspaceMember.updateOne(
          { workspaceId: targetWorkspaceId, userId },
          {
            $set: {
              role: normalizeRole(user?.role),
              status: 'active',
            },
            $setOnInsert: {
              joinedAt: new Date(),
              invitedEmail: String(user?.email || ''),
            },
          },
          { upsert: true },
        );
      }
      stats.membershipBackfilled += 1;
    }
  }

  return stats;
}

export async function classifyWorkspaceIntegrity(userIdValue) {
  const userId = toObjectId(userIdValue);
  if (!userId) {
    return { status: 'invalid-workspace', reason: 'invalid-user-id' };
  }

  const user = await User.findById(userId, { _id: 1, workspaceId: 1, role: 1 }).lean();
  if (!user) {
    return { status: 'missing-workspace', reason: 'user-not-found' };
  }

  const workspaceId = await resolveWorkspaceRef(user.workspaceId);
  if (!workspaceId) {
    return { status: 'missing-workspace', reason: 'workspace-not-found' };
  }

  const membership = await WorkspaceMember.findOne(
    { workspaceId, userId, status: 'active' },
    { _id: 1, role: 1 },
  ).lean();

  if (!membership) {
    const hasAnyMembership = await WorkspaceMember.findOne(
      { userId, status: 'active' },
      { _id: 1, workspaceId: 1 },
    ).lean();
    if (!hasAnyMembership) {
      return { status: 'no-membership', reason: 'no-active-memberships' };
    }
    return { status: 'forbidden', reason: 'not-a-member-of-primary-workspace' };
  }

  return {
    status: 'ready',
    reason: 'ok',
    workspaceId: String(workspaceId),
    membershipRole: membership.role,
  };
}
