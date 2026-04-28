import { Types } from 'mongoose';
import { WorkspaceInvite } from '../../models/workspaceInvite.model.js';
import { User } from '../../models/user.model.js';
import { Workspace } from '../../models/workspace.model.js';
import { randomToken, sha256 } from '../../utils/crypto.js';
import { queueInviteEmail } from '../auth/auth.mailer.js';
import { planLimitsService } from '../../services/planLimits.service.js';

function inviteExpiryDate() {
  const hours = Number(process.env.INVITE_EXPIRY_HOURS || 168);
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function appBasePath() {
  const configured = process.env.APP_BASE_PATH || process.env.CLIENT_BASE_PATH || process.env.FRONTEND_BASE_PATH || '/test-salesvision';
  const normalized = `/${String(configured || '').replace(/^\/+|\/+$/g, '')}`;
  return normalized === '/' ? '' : normalized;
}

function buildInviteLink(rawToken) {
  const appUrl = String(process.env.APP_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173').replace(/\/+$/, '');
  const basePath = appBasePath();
  const safeToken = encodeURIComponent(String(rawToken || ''));
  const hasBasePath = basePath && appUrl.endsWith(basePath);
  return `${appUrl}${hasBasePath ? '' : basePath}/invite/${safeToken}`;
}

export const invitesService = {
  async list({ workspaceId, query = {} }) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const where = { workspaceId };
    if (query.status) {
      where.status = query.status;
    }
    if (query.role) {
      where.role = query.role;
    }
    if (query.search) {
      const escaped = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      where.email = { $regex: escaped, $options: 'i' };
    }

    const [items, total] = await Promise.all([
      WorkspaceInvite.find(where, {
        workspaceId: 1,
        email: 1,
        role: 1,
        invitedByUserId: 1,
        expiresAt: 1,
        acceptedAt: 1,
        status: 1,
        createdAt: 1,
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WorkspaceInvite.countDocuments(where),
    ]);

    return { items, meta: { page, limit, total } };
  },

  async create({ workspaceId, actorUserId, data }) {
    const workspace = await Workspace.findById(workspaceId, { _id: 1, name: 1 }).lean();
    if (!workspace) {
      const error = new Error('Workspace not found');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    const inviter = await User.findOne(
      { _id: new Types.ObjectId(actorUserId), workspaceId: new Types.ObjectId(workspaceId) },
      { _id: 1, displayName: 1, email: 1 },
    ).lean();

    if (!inviter) {
      const error = new Error('Inviter not found');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    const capCheck = await planLimitsService.ensureMemberCapacity(workspaceId, 1);
    if (!capCheck.allowed) {
      const error = new Error(capCheck.message);
      error.statusCode = 429;
      error.code = capCheck.code;
      error.details = capCheck.details;
      throw error;
    }

    const rawToken = randomToken(24);
    const tokenHash = sha256(rawToken);
    const expiresAt = inviteExpiryDate();

    const existing = await WorkspaceInvite.findOne(
      {
        workspaceId,
        email: data.email,
        status: 'pending',
      },
      { _id: 1 },
    ).lean();

    let inviteId;
    if (existing) {
      await WorkspaceInvite.updateOne(
        { _id: existing._id },
        {
          $set: {
            role: data.role,
            tokenHash,
            invitedByUserId: inviter._id,
            expiresAt,
            status: 'pending',
          },
        },
      );
      inviteId = existing._id;
    } else {
      const created = await WorkspaceInvite.create({
        workspaceId,
        email: data.email,
        role: data.role,
        tokenHash,
        invitedByUserId: inviter._id,
        expiresAt,
        status: 'pending',
      });
      inviteId = created._id;
    }

    const inviteLink = buildInviteLink(rawToken);
    queueInviteEmail({
      to: data.email,
      workspaceName: workspace.name,
      inviterName: inviter.displayName,
      role: data.role,
      inviteLink,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      id: String(inviteId),
      email: data.email,
      role: data.role,
      status: 'pending',
      expiresAt,
      inviteLink,
      token: rawToken,
    };
  },

  async revoke({ workspaceId, inviteId }) {
    return WorkspaceInvite.findOneAndUpdate(
      { _id: inviteId, workspaceId, status: 'pending' },
      { $set: { status: 'revoked' } },
      { new: true, projection: { _id: 1, email: 1, role: 1, status: 1, expiresAt: 1 } },
    ).lean();
  },
};
