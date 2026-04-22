import mongoose from 'mongoose';
import { Workspace } from '../../models/workspace.model.js';
import { WorkspaceMember } from '../../models/workspaceMember.model.js';
import { WorkspaceInvite } from '../../models/workspaceInvite.model.js';
import { Activity } from '../../models/activity.model.js';
import { AuditLog } from '../../models/auditLog.model.js';
import { User } from '../../models/user.model.js';
import { randomToken, sha256 } from '../../utils/crypto.js';
import { emitDomainEvent } from '../../sockets/emitters.js';
import { workspaceRoom } from '../../sockets/rooms.js';
import { resolveWorkspaceId } from '../../services/workspace.service.js';
import { ApiError } from '../../utils/ApiError.js';

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function parsePage(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}

async function ensureUniqueSlug(raw) {
  const base = slugify(raw) || 'workspace';
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? '' : `-${index + 1}`;
    const slug = `${base}${suffix}`;
    const existing = await Workspace.findOne({ slug }, { _id: 1 }).lean();
    if (!existing) return slug;
  }
  return `${base}-${Date.now()}`;
}

function isOwner(role) {
  return String(role || '').toLowerCase() === 'owner';
}

async function writeAuditLog({ workspaceId, actorId, action, resource, resourceId, ip, userAgent }) {
  if (!workspaceId || !actorId) return;
  await AuditLog.create({
    workspaceId,
    actorId,
    action,
    resource,
    resourceId: String(resourceId || ''),
    ip: String(ip || ''),
    userAgent: String(userAgent || ''),
  });
}

/**
 * @param {{ workspaceId: string, actorId: string }} params
 */
async function assertOwner(params) {
  const membership = await WorkspaceMember.findOne(
    { workspaceId: params.workspaceId, userId: params.actorId, status: 'active' },
    { role: 1 },
  ).lean();

  if (!membership || !isOwner(membership.role)) {
    throw new ApiError(403, 'Owner role required', 'FORBIDDEN');
  }
}

export const workspacesService = {
  async list({ userId }) {
    const memberships = await WorkspaceMember.find(
      { userId, status: 'active' },
      { workspaceId: 1, role: 1, joinedAt: 1 },
    )
      .sort({ joinedAt: 1 })
      .limit(100)
      .lean();

    const workspaceIds = memberships.map((item) => item.workspaceId);
    const workspaces = await Workspace.find(
      { _id: { $in: workspaceIds } },
      { name: 1, slug: 1, settings: 1, logo: 1, ownerId: 1, createdAt: 1, updatedAt: 1 },
    ).limit(100).lean();

    const mapById = new Map(workspaces.map((workspace) => [String(workspace._id), workspace]));
    return memberships
      .map((item) => {
        const workspace = mapById.get(String(item.workspaceId));
        if (!workspace) return null;
        return {
          id: String(workspace._id),
          name: workspace.name,
          slug: workspace.slug,
          logo: workspace.logo || '',
          timezone: workspace.settings?.timezone || 'UTC',
          role: item.role,
          joinedAt: item.joinedAt,
          ownerId: workspace.ownerId ? String(workspace.ownerId) : '',
        };
      })
      .filter(Boolean);
  },

  async create({ actorId, body, req, io }) {
    const slug = await ensureUniqueSlug(body.slug || body.name);
    const workspace = await Workspace.create({
      name: body.name,
      slug,
      logo: body.logo || '',
      ownerId: new mongoose.Types.ObjectId(actorId),
      plan: 'starter',
      timezone: body.timezone || 'UTC',
      settings: {
        timezone: body.timezone || 'UTC',
        dateFormat: 'MMM DD, YYYY',
      },
    });

    await WorkspaceMember.create({
      workspaceId: workspace._id,
      userId: new mongoose.Types.ObjectId(actorId),
      role: 'owner',
      status: 'active',
      joinedAt: new Date(),
    });

    await writeAuditLog({
      workspaceId: workspace._id,
      actorId,
      action: 'workspace.created',
      resource: 'workspace',
      resourceId: workspace._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    emitDomainEvent(io, {
      workspaceId: String(workspace._id),
      moduleName: 'workspace',
      entity: 'workspace',
      action: 'created',
      data: workspace.toObject(),
    });

    return {
      id: String(workspace._id),
      name: workspace.name,
      slug: workspace.slug,
      logo: workspace.logo || '',
      timezone: workspace.timezone || workspace.settings?.timezone || 'UTC',
      role: 'owner',
    };
  },

  async getById({ workspaceId, userId }) {
    const resolvedId = await resolveWorkspaceId(workspaceId);
    if (!resolvedId) {
      throw new ApiError(404, 'Workspace not found', 'NOT_FOUND');
    }

    const [workspace, membership] = await Promise.all([
      Workspace.findById(
        resolvedId,
        { name: 1, slug: 1, logo: 1, ownerId: 1, plan: 1, timezone: 1, settings: 1, createdAt: 1, updatedAt: 1 },
      ).lean(),
      WorkspaceMember.findOne(
        { workspaceId: resolvedId, userId, status: 'active' },
        { role: 1, joinedAt: 1 },
      ).lean(),
    ]);

    if (!workspace || !membership) {
      throw new ApiError(404, 'Workspace not found', 'NOT_FOUND');
    }

    return {
      id: String(workspace._id),
      name: workspace.name,
      slug: workspace.slug,
      logo: workspace.logo || '',
      ownerId: workspace.ownerId ? String(workspace.ownerId) : '',
      plan: workspace.plan || 'starter',
      timezone: workspace.timezone || workspace.settings?.timezone || 'UTC',
      role: membership.role,
      joinedAt: membership.joinedAt,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  },

  async update({ workspaceId, actorId, body, req, io }) {
    const resolvedId = await resolveWorkspaceId(workspaceId);
    if (!resolvedId) {
      throw new ApiError(404, 'Workspace not found', 'NOT_FOUND');
    }

    await assertOwner({ workspaceId: resolvedId, actorId });

    const update = {};
    if (body.name) update.name = body.name;
    if (body.logo !== undefined) update.logo = body.logo;
    if (body.timezone) {
      update.timezone = body.timezone;
      update['settings.timezone'] = body.timezone;
    }
    if (body.slug) {
      const nextSlug = slugify(body.slug);
      const existing = await Workspace.findOne({ slug: nextSlug, _id: { $ne: resolvedId } }, { _id: 1 }).lean();
      if (existing) {
        throw new ApiError(409, 'Workspace slug already in use', 'CONFLICT');
      }
      update.slug = nextSlug;
    }

    const workspace = await Workspace.findOneAndUpdate(
      { _id: resolvedId },
      { $set: update },
      { new: true, projection: { name: 1, slug: 1, logo: 1, ownerId: 1, plan: 1, timezone: 1, settings: 1, createdAt: 1, updatedAt: 1 } },
    ).lean();

    await writeAuditLog({
      workspaceId: resolvedId,
      actorId,
      action: 'workspace.updated',
      resource: 'workspace',
      resourceId: resolvedId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    io.to(workspaceRoom(String(resolvedId))).emit('workspace:updated', {
      workspaceId: String(resolvedId),
      data: workspace,
      meta: { at: new Date().toISOString() },
    });

    return {
      id: String(workspace._id),
      name: workspace.name,
      slug: workspace.slug,
      logo: workspace.logo || '',
      ownerId: workspace.ownerId ? String(workspace.ownerId) : '',
      plan: workspace.plan || 'starter',
      timezone: workspace.timezone || workspace.settings?.timezone || 'UTC',
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  },

  async remove({ workspaceId, actorId, req, io }) {
    const resolvedId = await resolveWorkspaceId(workspaceId);
    if (!resolvedId) {
      throw new ApiError(404, 'Workspace not found', 'NOT_FOUND');
    }

    await assertOwner({ workspaceId: resolvedId, actorId });

    const members = await WorkspaceMember.find({ workspaceId: resolvedId, status: 'active' }, { userId: 1 }).lean();
    await Promise.all([
      Workspace.deleteOne({ _id: resolvedId }),
      WorkspaceMember.deleteMany({ workspaceId: resolvedId }),
      WorkspaceInvite.deleteMany({ workspaceId: resolvedId }),
    ]);

    await writeAuditLog({
      workspaceId: resolvedId,
      actorId,
      action: 'workspace.deleted',
      resource: 'workspace',
      resourceId: resolvedId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    io.to(workspaceRoom(String(resolvedId))).emit('workspace:deleted', {
      workspaceId: String(resolvedId),
      memberIds: members.map((item) => String(item.userId)),
      meta: { at: new Date().toISOString() },
    });

    return { removed: true };
  },

  async listMembers({ workspaceId, query = {} }) {
    const resolvedId = await resolveWorkspaceId(workspaceId);
    if (!resolvedId) {
      throw new ApiError(404, 'Workspace not found', 'NOT_FOUND');
    }

    const { page, limit, skip } = parsePage(query);
    const baseMatch = {
      workspaceId: new mongoose.Types.ObjectId(resolvedId),
      status: 'active',
    };

    if (query.role) {
      baseMatch.role = String(query.role);
    }

    const searchTerm = String(query.search || '').trim();
    const searchRegex = searchTerm ? new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;

    const pipeline = [
      { $match: baseMatch },
      {
        $lookup: {
          from: 'sv_users',
          localField: 'userId',
          foreignField: '_id',
          pipeline: [{ $project: { _id: 1, displayName: 1, email: 1, avatarUrl: 1, lastLoginAt: 1 } }],
          as: 'user',
        },
      },
      {
        $project: {
          _id: 0,
          userId: '$userId',
          role: 1,
          joinedAt: 1,
          user: { $first: '$user' },
        },
      },
    ];

    if (searchRegex) {
      pipeline.push({
        $match: {
          $or: [
            { 'user.displayName': { $regex: searchRegex } },
            { 'user.email': { $regex: searchRegex } },
          ],
        },
      });
    }

    pipeline.push(
      { $sort: { joinedAt: 1 } },
      {
        $facet: {
          items: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: 'count' }],
        },
      },
    );

    const [result] = await WorkspaceMember.aggregate(pipeline);
    const members = result?.items || [];
    const total = result?.total?.[0]?.count || 0;

    return {
      items: members.map((member) => ({
        userId: String(member.userId),
        role: member.role,
        joinedAt: member.joinedAt,
        name: member.user?.displayName || 'Unknown',
        email: member.user?.email || '',
        avatarUrl: member.user?.avatarUrl || '',
        lastLoginAt: member.user?.lastLoginAt || null,
      })),
      meta: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },

  async inviteMember({ workspaceId, actorId, body, req }) {
    const resolvedId = await resolveWorkspaceId(workspaceId);
    if (!resolvedId) {
      throw new ApiError(404, 'Workspace not found', 'NOT_FOUND');
    }

    const existingMember = await WorkspaceMember.findOne(
      { workspaceId: resolvedId, status: 'active' },
      { userId: 1 },
    ).lean();
    if (!existingMember) {
      throw new ApiError(400, 'Workspace has no active members', 'VALIDATION_ERROR');
    }

    const rawToken = randomToken(24);
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invite = await WorkspaceInvite.create({
      workspaceId: resolvedId,
      email: body.email,
      role: body.role,
      tokenHash,
      invitedByUserId: actorId,
      expiresAt,
      status: 'pending',
    });

    await writeAuditLog({
      workspaceId: resolvedId,
      actorId,
      action: 'workspace.member_invited',
      resource: 'workspace_member',
      resourceId: invite._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return {
      id: String(invite._id),
      email: invite.email,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt,
      token: rawToken,
    };
  },

  async updateMember({ workspaceId, actorId, userId, body, req, io }) {
    const resolvedId = await resolveWorkspaceId(workspaceId);
    if (!resolvedId) {
      throw new ApiError(404, 'Workspace not found', 'NOT_FOUND');
    }
    await assertOwner({ workspaceId: resolvedId, actorId });

    const member = await WorkspaceMember.findOneAndUpdate(
      { workspaceId: resolvedId, userId, status: 'active' },
      { $set: { role: body.role } },
      { new: true, projection: { role: 1, userId: 1, joinedAt: 1 } },
    ).lean();

    if (!member) {
      throw new ApiError(404, 'Workspace member not found', 'NOT_FOUND');
    }

    await User.updateOne({ _id: userId, workspaceId: resolvedId }, { $set: { role: body.role } });

    await writeAuditLog({
      workspaceId: resolvedId,
      actorId,
      action: 'workspace.member_role_updated',
      resource: 'workspace_member',
      resourceId: userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    io.to(workspaceRoom(String(resolvedId))).emit('member:updated', {
      workspaceId: String(resolvedId),
      userId: String(userId),
      role: body.role,
      meta: { at: new Date().toISOString() },
    });

    return {
      userId: String(member.userId),
      role: member.role,
      joinedAt: member.joinedAt,
    };
  },

  async removeMember({ workspaceId, actorId, userId, req, io }) {
    const resolvedId = await resolveWorkspaceId(workspaceId);
    if (!resolvedId) {
      throw new ApiError(404, 'Workspace not found', 'NOT_FOUND');
    }
    await assertOwner({ workspaceId: resolvedId, actorId });

    const ownerCount = await WorkspaceMember.countDocuments({ workspaceId: resolvedId, status: 'active', role: 'owner' });
    const target = await WorkspaceMember.findOne({ workspaceId: resolvedId, userId, status: 'active' }, { role: 1 }).lean();
    if (!target) {
      throw new ApiError(404, 'Workspace member not found', 'NOT_FOUND');
    }
    if (target.role === 'owner' && ownerCount <= 1) {
      throw new ApiError(400, 'Cannot remove the last owner', 'VALIDATION_ERROR');
    }

    await WorkspaceMember.updateOne({ workspaceId: resolvedId, userId }, { $set: { status: 'suspended' } });

    await writeAuditLog({
      workspaceId: resolvedId,
      actorId,
      action: 'workspace.member_removed',
      resource: 'workspace_member',
      resourceId: userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    io.to(workspaceRoom(String(resolvedId))).emit('member:left', {
      workspaceId: String(resolvedId),
      userId: String(userId),
      meta: { at: new Date().toISOString() },
    });

    return { removed: true, userId: String(userId) };
  },

  async auditLog({ workspaceId, query = {} }) {
    const resolvedId = await resolveWorkspaceId(workspaceId);
    if (!resolvedId) {
      throw new ApiError(404, 'Workspace not found', 'NOT_FOUND');
    }

    const { page, limit, skip } = parsePage(query);
    const where = { workspaceId: new mongoose.Types.ObjectId(resolvedId) };
    if (query.actor) where.actorId = new mongoose.Types.ObjectId(String(query.actor));
    if (query.action) where.action = String(query.action);
    if (query.resource) where.resource = String(query.resource);

    const [items, total] = await Promise.all([
      AuditLog.find(where, { workspaceId: 0 })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(where),
    ]);

    return { items, meta: { page, limit, total } };
  },

  async activity({ workspaceId, query = {} }) {
    const resolvedId = await resolveWorkspaceId(workspaceId);
    if (!resolvedId) {
      throw new ApiError(404, 'Workspace not found', 'NOT_FOUND');
    }

    const { page, limit, skip } = parsePage(query);
    const where = { workspaceId: String(resolvedId) };
    if (query.entity) where.entity = String(query.entity);
    if (query.entityId) where.entityId = String(query.entityId);
    if (query.actor) where.actor = String(query.actor);

    const [items, total] = await Promise.all([
      Activity.find(where)
        .sort({ occurredAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Activity.countDocuments(where),
    ]);

    return { items, meta: { page, limit, total } };
  },
};
