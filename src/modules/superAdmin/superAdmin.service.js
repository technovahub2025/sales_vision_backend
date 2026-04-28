import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { signAccessToken } from '../../config/jwt.js';
import { SuperAdmin } from '../../models/superAdmin.model.js';
import { User } from '../../models/user.model.js';
import { Workspace } from '../../models/workspace.model.js';
import { WorkspaceMember } from '../../models/workspaceMember.model.js';
import { WorkspaceInvite } from '../../models/workspaceInvite.model.js';
import { Project } from '../../models/project.model.js';
import { Task } from '../../models/task.model.js';
import { Activity } from '../../models/activity.model.js';
import { AuditLog } from '../../models/auditLog.model.js';
import { SecuritySession } from '../../models/securitySession.model.js';
import { SecurityApiKey } from '../../models/securityApiKey.model.js';
import { TimeLog } from '../../models/timeLog.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { planLimitsService } from '../../services/planLimits.service.js';

export const SUPER_ADMIN_EMAIL = 'superadmin@gmail.com';
const SUPER_ADMIN_PASSWORD = 'Super@123';
const FINAL_TASK_STATUSES = ['completed', 'done', 'closed'];

export function isSuperAdminEmail(email) {
  return String(email || '').trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureDefaultSuperAdmin() {
  const email = SUPER_ADMIN_EMAIL;
  const existing = await SuperAdmin.findOne({ email }).select('+passwordHash');
  const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);

  if (!existing) {
    return SuperAdmin.create({
      email,
      passwordHash,
      displayName: 'Super Admin',
      isActive: true,
    });
  }

  const valid = await bcrypt.compare(SUPER_ADMIN_PASSWORD, existing.passwordHash);
  if (!valid || !existing.isActive) {
    existing.passwordHash = passwordHash;
    existing.isActive = true;
    existing.displayName = existing.displayName || 'Super Admin';
    await existing.save();
  }

  return existing;
}

function issueSuperAdminToken(admin) {
  return signAccessToken({
    userId: String(admin._id),
    email: admin.email,
    role: 'super_admin',
    scope: 'super_admin',
    isSuperAdmin: true,
  });
}

function serializeAdmin(admin) {
  return {
    id: String(admin._id),
    email: admin.email,
    displayName: admin.displayName || 'Super Admin',
    role: 'super_admin',
    isSuperAdmin: true,
    scope: 'super_admin',
  };
}

function emitSuperAdminUsersUpdated(io, payload = {}) {
  if (!io) return;
  io.emit('superadmin:users_updated', {
    at: new Date().toISOString(),
    ...payload,
  });
}

function pagination(query = {}, fallbackLimit = 25) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || fallbackLimit, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}

function safeObjectId(value) {
  if (!value) return null;
  try {
    return new Types.ObjectId(String(value));
  } catch {
    return null;
  }
}

function healthBadges(workspace) {
  const badges = [];
  const lastActivity = workspace.lastActivityAt ? new Date(workspace.lastActivityAt) : null;
  const staleCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

  if (workspace.ownerless) badges.push('needs_owner');
  if (Number(workspace.overdueTasks || 0) > 0) badges.push('overdue_risk');
  if (
    Number(workspace.inactiveUsers || 0) > 0 ||
    (lastActivity && !Number.isNaN(lastActivity.getTime()) && lastActivity.getTime() < staleCutoff)
  ) {
    badges.push('inactive');
  }
  if (Number(workspace.pendingInvites || 0) > 0) badges.push('invite_pending');
  if (!badges.length) badges.push('healthy');
  return badges;
}

async function refreshUserWorkspaceState(userObjectId, removedWorkspaceObjectId) {
  const remainingMember = await WorkspaceMember.findOne({
    userId: userObjectId,
    status: 'active',
  })
    .sort({ joinedAt: -1, _id: -1 })
    .lean();

  if (remainingMember) {
    await User.updateOne(
      { _id: userObjectId },
      {
        $set: {
          workspaceId: remainingMember.workspaceId,
          role: remainingMember.role,
          isActive: true,
        },
      },
    );
    return;
  }

  await User.updateOne(
    { _id: userObjectId, workspaceId: removedWorkspaceObjectId },
    { $set: { isActive: false } },
  );
}

async function removeWorkspaceMembership({ workspaceId, userId, throwIfMissing = true }) {
  const workspaceObjectId = new Types.ObjectId(workspaceId);
  const userObjectId = new Types.ObjectId(userId);

  const [workspace, user, member] = await Promise.all([
    Workspace.findById(workspaceObjectId, { _id: 1, ownerId: 1 }).lean(),
    User.findById(userObjectId, { _id: 1, email: 1, displayName: 1, workspaceId: 1 }).lean(),
    WorkspaceMember.findOne({ workspaceId: workspaceObjectId, userId: userObjectId }).lean(),
  ]);

  if (!workspace) {
    throw new ApiError(404, 'Workspace not found', 'NOT_FOUND');
  }
  if (!user) {
    throw new ApiError(404, 'User not found', 'NOT_FOUND');
  }
  if (!member) {
    if (throwIfMissing) {
      throw new ApiError(404, 'Membership not found', 'NOT_FOUND');
    }
    return {
      removed: false,
      userId: String(userObjectId),
      workspaceId: String(workspaceObjectId),
      reason: 'membership_not_found',
    };
  }

  await WorkspaceMember.deleteOne({ _id: member._id });
  if (String(workspace.ownerId || '') === String(userObjectId)) {
    await Workspace.updateOne({ _id: workspaceObjectId }, { $set: { ownerId: null } });
  }
  await refreshUserWorkspaceState(userObjectId, workspaceObjectId);

  return {
    removed: true,
    userId: String(userObjectId),
    workspaceId: String(workspaceObjectId),
    name: user.displayName || 'Unknown',
    email: user.email || '',
    role: member.role,
    status: member.status,
  };
}

async function buildWorkspaceHealth({ query = {}, defaultLimit = 25 } = {}) {
  const { page, limit, skip } = pagination(query, defaultLimit);
  const search = String(query.search || '').trim();
  const health = String(query.health || '').trim();
  const aggregateSkip = health ? 0 : skip;
  const aggregateLimit = health ? 1000 : limit;
  const match = search
    ? {
        $or: [
          { name: new RegExp(escapeRegex(search), 'i') },
          { slug: new RegExp(escapeRegex(search), 'i') },
        ],
      }
    : {};

  const now = new Date();
  const [items, total] = await Promise.all([
    Workspace.aggregate([
      { $match: match },
      { $sort: { updatedAt: -1, createdAt: -1, _id: -1 } },
      { $skip: aggregateSkip },
      { $limit: aggregateLimit },
      {
        $lookup: {
          from: 'sv_users',
          localField: 'ownerId',
          foreignField: '_id',
          pipeline: [{ $project: { displayName: 1, email: 1 } }],
          as: 'owner',
        },
      },
      {
        $lookup: {
          from: 'sv_workspace_members',
          let: { workspaceId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$workspaceId', '$$workspaceId'] } } },
            {
              $lookup: {
                from: 'sv_users',
                localField: 'userId',
                foreignField: '_id',
                pipeline: [{ $project: { isActive: 1 } }],
                as: 'user',
              },
            },
            {
              $group: {
                _id: null,
                userCount: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
                inactiveUsers: {
                  $sum: {
                    $cond: [
                      {
                        $or: [
                          { $ne: ['$status', 'active'] },
                          { $eq: [{ $ifNull: [{ $first: '$user.isActive' }, true] }, false] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
          as: 'memberStats',
        },
      },
      {
        $lookup: {
          from: 'sv_workspace_invites',
          let: { workspaceId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$workspaceId', '$$workspaceId'] }, status: 'pending' } },
            { $count: 'count' },
          ],
          as: 'pendingInviteStats',
        },
      },
      {
        $lookup: {
          from: 'sv_projects',
          let: { workspaceId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$workspaceId', '$$workspaceId'] } } },
            {
              $group: {
                _id: null,
                projectCount: { $sum: 1 },
                activeProjects: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
                lastProjectAt: { $max: '$updatedAt' },
              },
            },
          ],
          as: 'projectStats',
        },
      },
      {
        $lookup: {
          from: 'sv_tasks',
          let: { workspaceId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$workspaceId', '$$workspaceId'] }, archived: { $ne: true } } },
            {
              $group: {
                _id: null,
                taskCount: { $sum: 1 },
                openTasks: { $sum: { $cond: [{ $in: ['$status', FINAL_TASK_STATUSES] }, 0, 1] } },
                overdueTasks: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $lt: ['$dueDate', now] },
                          { $not: [{ $in: ['$status', FINAL_TASK_STATUSES] }] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                lastTaskAt: { $max: '$updatedAt' },
              },
            },
          ],
          as: 'taskStats',
        },
      },
      {
        $lookup: {
          from: 'sv_activity',
          let: { workspaceId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$workspaceId', '$$workspaceId'] } } },
            { $sort: { occurredAt: -1 } },
            { $limit: 1 },
            { $project: { occurredAt: 1 } },
          ],
          as: 'lastActivity',
        },
      },
      {
        $lookup: {
          from: 'sv_time_logs',
          let: { workspaceId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$workspaceId', '$$workspaceId'] }, isDeleted: { $ne: true } } },
            { $group: { _id: null, totalMins: { $sum: { $ifNull: ['$durationMins', 0] } } } },
          ],
          as: 'timeStats',
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          slug: 1,
          ownerId: 1,
          owner: { $ifNull: [{ $first: '$owner' }, null] },
          plan: 1,
          timezone: 1,
          createdAt: 1,
          updatedAt: 1,
          ownerless: { $eq: ['$ownerId', null] },
          userCount: { $ifNull: [{ $first: '$memberStats.userCount' }, 0] },
          inactiveUsers: { $ifNull: [{ $first: '$memberStats.inactiveUsers' }, 0] },
          pendingInvites: { $ifNull: [{ $first: '$pendingInviteStats.count' }, 0] },
          projectCount: { $ifNull: [{ $first: '$projectStats.projectCount' }, 0] },
          activeProjects: { $ifNull: [{ $first: '$projectStats.activeProjects' }, 0] },
          taskCount: { $ifNull: [{ $first: '$taskStats.taskCount' }, 0] },
          openTasks: { $ifNull: [{ $first: '$taskStats.openTasks' }, 0] },
          overdueTasks: { $ifNull: [{ $first: '$taskStats.overdueTasks' }, 0] },
          totalTimeLoggedMins: { $ifNull: [{ $first: '$timeStats.totalMins' }, 0] },
          lastActivityAt: {
            $ifNull: [
              { $first: '$lastActivity.occurredAt' },
              { $ifNull: [{ $first: '$taskStats.lastTaskAt' }, { $ifNull: [{ $first: '$projectStats.lastProjectAt' }, '$updatedAt'] }] },
            ],
          },
        },
      },
    ]),
    Workspace.countDocuments(match),
  ]);

  const normalized = items.map((workspace) => {
    const item = {
      id: String(workspace._id),
      name: workspace.name,
      slug: workspace.slug,
      ownerId: workspace.ownerId ? String(workspace.ownerId) : '',
      owner: workspace.owner
        ? {
            id: String(workspace.owner._id),
            name: workspace.owner.displayName || '',
            email: workspace.owner.email || '',
          }
        : null,
      plan: planLimitsService.normalizePlan(workspace.plan),
      timezone: workspace.timezone || 'UTC',
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      lastActivityAt: workspace.lastActivityAt || null,
      ownerless: Boolean(workspace.ownerless),
      userCount: Number(workspace.userCount || 0),
      inactiveUsers: Number(workspace.inactiveUsers || 0),
      pendingInvites: Number(workspace.pendingInvites || 0),
      projectCount: Number(workspace.projectCount || 0),
      activeProjects: Number(workspace.activeProjects || 0),
      taskCount: Number(workspace.taskCount || 0),
      openTasks: Number(workspace.openTasks || 0),
      overdueTasks: Number(workspace.overdueTasks || 0),
      totalTimeLoggedMins: Number(workspace.totalTimeLoggedMins || 0),
    };
    return { ...item, health: healthBadges(item) };
  });

  const filtered = health ? normalized.filter((item) => item.health.includes(health)) : normalized;
  const visibleItems = health ? filtered.slice(skip, skip + limit) : filtered;
  const visibleTotal = health ? filtered.length : total;
  return {
    items: visibleItems,
    meta: { page, limit, total: visibleTotal, pages: Math.max(1, Math.ceil(visibleTotal / limit)) },
  };
}

export const superAdminService = {
  async login({ body }) {
    const admin = await ensureDefaultSuperAdmin();
    if (!isSuperAdminEmail(body.email)) {
      throw new ApiError(401, 'Invalid credentials', 'UNAUTHORIZED');
    }

    const valid = await bcrypt.compare(body.password, admin.passwordHash);
    if (!valid) {
      throw new ApiError(401, 'Invalid credentials', 'UNAUTHORIZED');
    }

    await SuperAdmin.updateOne({ _id: admin._id }, { $set: { lastLoginAt: new Date() } });
    const accessToken = issueSuperAdminToken(admin);

    return {
      accessToken,
      admin: serializeAdmin(admin),
    };
  },

  async me({ adminId }) {
    const admin = await SuperAdmin.findOne({ _id: adminId, isActive: true }).lean();
    if (!admin) {
      throw new ApiError(404, 'Super admin not found', 'NOT_FOUND');
    }
    return { admin: serializeAdmin(admin) };
  },

  async summary() {
    const [workspaceCount, roleCountsRaw, ownerlessCount] = await Promise.all([
      Workspace.countDocuments({}),
      WorkspaceMember.aggregate([
        { $match: { status: 'active' } },
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 },
          },
        },
      ]),
      Workspace.countDocuments({
        $or: [
          { ownerId: { $exists: false } },
          { ownerId: null },
        ],
      }),
    ]);

    const roleCounts = { owner: 0, admin: 0, member: 0, viewer: 0 };
    for (const item of roleCountsRaw || []) {
      if (Object.prototype.hasOwnProperty.call(roleCounts, item._id)) {
        roleCounts[item._id] = Number(item.count || 0);
      }
    }

    return {
      workspaceCount,
      userCount: Object.values(roleCounts).reduce((total, count) => total + count, 0),
      ownerlessWorkspaceCount: ownerlessCount,
      roleCounts,
    };
  },

  async dashboard() {
    const now = new Date();
    const metricDefaults = {
      workspaceCount: 0,
      userCount: 0,
      projectCount: 0,
      openTasks: 0,
      overdueTasks: 0,
      pendingInvites: 0,
      ownerlessWorkspaceCount: 0,
      activityCount: 0,
    };

    const [
      workspaceCount,
      userCount,
      projectCount,
      openTasks,
      overdueTasks,
      pendingInvites,
      ownerlessWorkspaceCount,
      activityCount,
      recentActivityResult,
      workspaceHealthResult,
    ] = await Promise.allSettled([
      Workspace.countDocuments({}),
      WorkspaceMember.countDocuments({ status: 'active' }),
      Project.countDocuments({}),
      Task.countDocuments({ archived: { $ne: true }, status: { $nin: FINAL_TASK_STATUSES } }),
      Task.countDocuments({
        archived: { $ne: true },
        status: { $nin: FINAL_TASK_STATUSES },
        dueDate: { $lt: now },
      }),
      WorkspaceInvite.countDocuments({ status: 'pending' }),
      Workspace.countDocuments({
        $or: [
          { ownerId: { $exists: false } },
          { ownerId: null },
        ],
      }),
      Activity.countDocuments({}),
      Activity.aggregate([
        { $sort: { occurredAt: -1, _id: -1 } },
        { $limit: 8 },
        {
          $lookup: {
            from: 'sv_workspaces',
            localField: 'workspaceId',
            foreignField: '_id',
            pipeline: [{ $project: { name: 1, slug: 1 } }],
            as: 'workspace',
          },
        },
        {
          $project: {
            module: 1,
            action: 1,
            entity: 1,
            message: 1,
            actor: 1,
            occurredAt: 1,
            workspace: { $ifNull: [{ $first: '$workspace' }, null] },
          },
        },
      ]),
      buildWorkspaceHealth({ query: { page: 1, limit: 6 }, defaultLimit: 6 }),
    ]);

    const settledValue = (result, fallback) => (result.status === 'fulfilled' ? result.value : fallback);
    const recentActivityRaw = settledValue(recentActivityResult, []);
    const workspaceHealthData = settledValue(workspaceHealthResult, { items: [] });
    const metrics = {
      workspaceCount: Number(settledValue(workspaceCount, metricDefaults.workspaceCount) || 0),
      userCount: Number(settledValue(userCount, metricDefaults.userCount) || 0),
      projectCount: Number(settledValue(projectCount, metricDefaults.projectCount) || 0),
      openTasks: Number(settledValue(openTasks, metricDefaults.openTasks) || 0),
      overdueTasks: Number(settledValue(overdueTasks, metricDefaults.overdueTasks) || 0),
      pendingInvites: Number(settledValue(pendingInvites, metricDefaults.pendingInvites) || 0),
      ownerlessWorkspaceCount: Number(settledValue(ownerlessWorkspaceCount, metricDefaults.ownerlessWorkspaceCount) || 0),
      activityCount: Number(settledValue(activityCount, metricDefaults.activityCount) || 0),
    };

    return {
      metrics,
      riskWorkspaces: (workspaceHealthData.items || [])
        .filter((item) => !item.health.includes('healthy'))
        .slice(0, 5),
      recentActivity: (recentActivityRaw || []).map((item) => ({
        id: String(item._id),
        module: item.module,
        action: item.action,
        entity: item.entity,
        message: item.message || '',
        actor: item.actor || 'System',
        occurredAt: item.occurredAt,
        workspace: item.workspace
          ? {
              id: String(item.workspace._id),
              name: item.workspace.name || '',
              slug: item.workspace.slug || '',
            }
          : null,
      })),
      generatedAt: new Date().toISOString(),
    };
  },

  async listWorkspaces({ query = {} }) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
    const skip = (page - 1) * limit;
    const search = String(query.search || '').trim();
    const match = search
      ? {
          $or: [
            { name: new RegExp(escapeRegex(search), 'i') },
            { slug: new RegExp(escapeRegex(search), 'i') },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      Workspace.aggregate([
        { $match: match },
        { $sort: { createdAt: -1, _id: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: 'sv_workspace_members',
            let: { workspaceId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$workspaceId', '$$workspaceId'] },
                  status: 'active',
                },
              },
              {
                $group: {
                  _id: '$role',
                  count: { $sum: 1 },
                },
              },
            ],
            as: 'roleCountsRaw',
          },
        },
        {
          $lookup: {
            from: 'sv_users',
            localField: 'ownerId',
            foreignField: '_id',
            pipeline: [{ $project: { _id: 1, displayName: 1, email: 1 } }],
            as: 'owner',
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            slug: 1,
            ownerId: 1,
            owner: { $ifNull: [{ $first: '$owner' }, null] },
            plan: 1,
            timezone: 1,
            createdAt: 1,
            updatedAt: 1,
            roleCountsRaw: 1,
            userCount: { $sum: '$roleCountsRaw.count' },
          },
        },
      ]),
      Workspace.countDocuments(match),
    ]);

    const normalized = items.map((workspace) => {
      const roleCounts = { owner: 0, admin: 0, member: 0, viewer: 0 };
      for (const item of workspace.roleCountsRaw || []) {
        if (Object.prototype.hasOwnProperty.call(roleCounts, item._id)) {
          roleCounts[item._id] = Number(item.count || 0);
        }
      }
      return {
        id: String(workspace._id),
        name: workspace.name,
        slug: workspace.slug,
        ownerId: workspace.ownerId ? String(workspace.ownerId) : '',
        owner: workspace.owner
          ? {
              id: String(workspace.owner._id),
              name: workspace.owner.displayName || '',
              email: workspace.owner.email || '',
            }
          : null,
        plan: planLimitsService.normalizePlan(workspace.plan),
        timezone: workspace.timezone,
        userCount: Number(workspace.userCount || 0),
        roleCounts,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      };
    });

    return {
      items: normalized,
      meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    };
  },

  async listWorkspaceUsers({ workspaceId, query = {} }) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
    const skip = (page - 1) * limit;
    const workspaceObjectId = new Types.ObjectId(workspaceId);
    const search = String(query.search || '').trim();
    const userSearch = search
      ? {
          $or: [
            { 'user.displayName': new RegExp(escapeRegex(search), 'i') },
            { 'user.email': new RegExp(escapeRegex(search), 'i') },
            { role: new RegExp(escapeRegex(search), 'i') },
          ],
        }
      : {};

    const pipeline = [
      { $match: { workspaceId: workspaceObjectId } },
      {
        $lookup: {
          from: 'sv_users',
          localField: 'userId',
          foreignField: '_id',
          pipeline: [{ $project: { _id: 1, displayName: 1, email: 1, role: 1, isActive: 1, lastLoginAt: 1, createdAt: 1 } }],
          as: 'user',
        },
      },
      { $unwind: '$user' },
      ...(search ? [{ $match: userSearch }] : []),
      { $sort: { joinedAt: -1, _id: -1 } },
      {
        $facet: {
          items: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: 'count' }],
        },
      },
    ];

    const [result] = await WorkspaceMember.aggregate(pipeline);
    const total = Number(result?.total?.[0]?.count || 0);

    return {
      items: (result?.items || []).map((member) => ({
        userId: String(member.userId),
        workspaceId: String(member.workspaceId),
        name: member.user.displayName || 'Unknown',
        email: member.user.email || '',
        userRole: member.user.role || '',
        role: member.role,
        status: member.status,
        isActive: Boolean(member.user.isActive),
        joinedAt: member.joinedAt,
        lastLoginAt: member.user.lastLoginAt || null,
        createdAt: member.user.createdAt || null,
      })),
      meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    };
  },

  async listUsers({ query = {} }) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
    const skip = (page - 1) * limit;
    const search = String(query.search || '').trim();
    const match = {};

    if (query.workspaceId) {
      match.workspaceId = new Types.ObjectId(query.workspaceId);
    }
    if (query.role) {
      match.role = query.role;
    }
    if (query.status) {
      match.status = query.status;
    }

    const searchMatch = search
      ? {
          $or: [
            { 'user.displayName': new RegExp(escapeRegex(search), 'i') },
            { 'user.email': new RegExp(escapeRegex(search), 'i') },
            { 'workspace.name': new RegExp(escapeRegex(search), 'i') },
            { 'workspace.slug': new RegExp(escapeRegex(search), 'i') },
          ],
        }
      : null;

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: 'sv_users',
          localField: 'userId',
          foreignField: '_id',
          pipeline: [{ $project: { _id: 1, displayName: 1, email: 1, role: 1, isActive: 1, lastLoginAt: 1, createdAt: 1 } }],
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $lookup: {
          from: 'sv_workspaces',
          localField: 'workspaceId',
          foreignField: '_id',
          pipeline: [{ $project: { _id: 1, name: 1, slug: 1 } }],
          as: 'workspace',
        },
      },
      { $unwind: { path: '$workspace', preserveNullAndEmptyArrays: true } },
      ...(searchMatch ? [{ $match: searchMatch }] : []),
      { $sort: { joinedAt: -1, _id: -1 } },
      {
        $facet: {
          items: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: 'count' }],
        },
      },
    ];

    const [result] = await WorkspaceMember.aggregate(pipeline);
    const total = Number(result?.total?.[0]?.count || 0);

    return {
      items: (result?.items || []).map((member) => ({
        userId: String(member.userId),
        workspaceId: String(member.workspaceId),
        workspace: member.workspace
          ? {
              id: String(member.workspace._id),
              name: member.workspace.name || '',
              slug: member.workspace.slug || '',
            }
          : null,
        name: member.user.displayName || 'Unknown',
        email: member.user.email || '',
        userRole: member.user.role || '',
        role: member.role,
        status: member.status,
        isActive: Boolean(member.user.isActive),
        joinedAt: member.joinedAt,
        lastLoginAt: member.user.lastLoginAt || null,
        createdAt: member.user.createdAt || null,
      })),
      meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    };
  },

  async workspaceHealth({ query = {} }) {
    return buildWorkspaceHealth({ query, defaultLimit: 25 });
  },

  async activity({ query = {} }) {
    const { page, limit, skip } = pagination(query, 25);
    const filter = {};
    const workspaceObjectId = safeObjectId(query.workspaceId);
    if (workspaceObjectId) filter.workspaceId = workspaceObjectId;
    if (query.module) filter.module = String(query.module).trim();
    if (query.action) filter.action = String(query.action).trim();
    if (query.dateFrom || query.dateTo) {
      filter.occurredAt = {};
      if (query.dateFrom) filter.occurredAt.$gte = new Date(query.dateFrom);
      if (query.dateTo) filter.occurredAt.$lte = new Date(query.dateTo);
    }

    const [items, total] = await Promise.all([
      Activity.aggregate([
        { $match: filter },
        { $sort: { occurredAt: -1, _id: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: 'sv_workspaces',
            localField: 'workspaceId',
            foreignField: '_id',
            pipeline: [{ $project: { name: 1, slug: 1 } }],
            as: 'workspace',
          },
        },
        {
          $addFields: {
            actorIdObj: {
              $convert: {
                input: '$payload.actorId',
                to: 'objectId',
                onError: null,
                onNull: null,
              },
            },
          },
        },
        {
          $lookup: {
            from: 'sv_users',
            localField: 'actorIdObj',
            foreignField: '_id',
            pipeline: [{ $project: { displayName: 1, email: 1 } }],
            as: 'actorUser',
          },
        },
        {
          $project: {
            module: 1,
            action: 1,
            entity: 1,
            entityId: 1,
            message: 1,
            actor: 1,
            occurredAt: 1,
            workspace: { $ifNull: [{ $first: '$workspace' }, null] },
            actorUser: { $ifNull: [{ $first: '$actorUser' }, null] },
          },
        },
      ]),
      Activity.countDocuments(filter),
    ]);

    return {
      items: items.map((item) => ({
        id: String(item._id),
        workspaceId: item.workspace?._id ? String(item.workspace._id) : '',
        workspace: item.workspace
          ? {
              id: String(item.workspace._id),
              name: item.workspace.name || '',
              slug: item.workspace.slug || '',
            }
          : null,
        actor: item.actorUser
          ? {
              name: item.actorUser.displayName || item.actor || 'Member',
              email: item.actorUser.email || '',
            }
          : { name: item.actor || 'System', email: '' },
        module: item.module,
        action: item.action,
        entity: item.entity,
        entityId: item.entityId,
        message: item.message || '',
        occurredAt: item.occurredAt,
      })),
      meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    };
  },

  async security({ query = {} }) {
    const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 50);
    const [
      activeSessions,
      revokedSessions,
      activeApiKeys,
      revokedApiKeys,
      pendingInvites,
      expiredInvites,
      recentSessions,
      recentApiKeys,
      recentInvites,
      auditEvents,
    ] = await Promise.all([
      SecuritySession.countDocuments({ revoked: { $ne: true } }),
      SecuritySession.countDocuments({ revoked: true }),
      SecurityApiKey.countDocuments({ revoked: { $ne: true } }),
      SecurityApiKey.countDocuments({ revoked: true }),
      WorkspaceInvite.countDocuments({ status: 'pending' }),
      WorkspaceInvite.countDocuments({ $or: [{ status: 'expired' }, { expiresAt: { $lt: new Date() }, acceptedAt: null }] }),
      SecuritySession.find({}, { device: 1, location: 1, ipAddress: 1, lastActiveAt: 1, revoked: 1, workspaceId: 1 })
        .sort({ lastActiveAt: -1, _id: -1 })
        .limit(limit)
        .lean(),
      SecurityApiKey.find({}, { name: 1, tokenMasked: 1, lastUsedAt: 1, revoked: 1, workspaceId: 1, updatedAt: 1 })
        .sort({ updatedAt: -1, _id: -1 })
        .limit(limit)
        .lean(),
      WorkspaceInvite.find({}, { email: 1, role: 1, status: 1, expiresAt: 1, workspaceId: 1, createdAt: 1 })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .lean(),
      AuditLog.find({}, { workspaceId: 1, actorId: 1, action: 1, resource: 1, resourceId: 1, ip: 1, createdAt: 1 })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .lean(),
    ]);

    const workspaceIds = [
      ...recentSessions,
      ...recentApiKeys,
      ...recentInvites,
      ...auditEvents,
    ]
      .map((item) => item.workspaceId)
      .filter(Boolean);
    const workspaces = await Workspace.find({ _id: { $in: workspaceIds } }, { name: 1, slug: 1 }).lean();
    const workspaceMap = new Map(workspaces.map((workspace) => [String(workspace._id), workspace]));
    const serializeWorkspace = (workspaceId) => {
      const workspace = workspaceMap.get(String(workspaceId || ''));
      return workspace
        ? { id: String(workspace._id), name: workspace.name || '', slug: workspace.slug || '' }
        : null;
    };

    return {
      metrics: {
        activeSessions,
        revokedSessions,
        activeApiKeys,
        revokedApiKeys,
        pendingInvites,
        expiredInvites,
      },
      sessions: recentSessions.map((item) => ({
        id: String(item._id),
        workspace: serializeWorkspace(item.workspaceId),
        device: item.device || 'Unknown device',
        location: item.location || '',
        ipAddress: item.ipAddress || '',
        lastActiveAt: item.lastActiveAt,
        revoked: Boolean(item.revoked),
      })),
      apiKeys: recentApiKeys.map((item) => ({
        id: String(item._id),
        workspace: serializeWorkspace(item.workspaceId),
        name: item.name,
        tokenMasked: item.tokenMasked,
        lastUsedAt: item.lastUsedAt || null,
        revoked: Boolean(item.revoked),
      })),
      invites: recentInvites.map((item) => ({
        id: String(item._id),
        workspace: serializeWorkspace(item.workspaceId),
        email: item.email,
        role: item.role,
        status: item.status,
        expiresAt: item.expiresAt,
        createdAt: item.createdAt,
      })),
      auditEvents: auditEvents.map((item) => ({
        id: String(item._id),
        workspace: serializeWorkspace(item.workspaceId),
        actorId: item.actorId ? String(item.actorId) : '',
        action: item.action,
        resource: item.resource,
        resourceId: item.resourceId,
        ip: item.ip || '',
        createdAt: item.createdAt,
      })),
      generatedAt: new Date().toISOString(),
    };
  },

  async updateWorkspaceUserRole({ workspaceId, userId, role, io }) {
    const workspaceObjectId = new Types.ObjectId(workspaceId);
    const userObjectId = new Types.ObjectId(userId);

    const [workspace, user] = await Promise.all([
      Workspace.findById(workspaceObjectId, { _id: 1, ownerId: 1 }).lean(),
      User.findById(userObjectId, { _id: 1, email: 1, displayName: 1 }).lean(),
    ]);
    if (!workspace) {
      throw new ApiError(404, 'Workspace not found', 'NOT_FOUND');
    }
    if (!user) {
      throw new ApiError(404, 'User not found', 'NOT_FOUND');
    }

    const existingMember = await WorkspaceMember.findOne(
      { workspaceId: workspaceObjectId, userId: userObjectId },
      { status: 1 },
    ).lean();
    const activatesMembership = !existingMember || existingMember.status !== 'active';
    if (activatesMembership) {
      const capCheck = await planLimitsService.ensureMemberCapacity(workspaceObjectId, 1);
      if (!capCheck.allowed) {
        throw new ApiError(429, capCheck.message, capCheck.code, capCheck.details);
      }
    }

    const member = await WorkspaceMember.findOneAndUpdate(
      { workspaceId: workspaceObjectId, userId: userObjectId },
      {
        $set: {
          role,
          status: 'active',
          joinedAt: new Date(),
        },
        $setOnInsert: {
          invitedEmail: user.email,
        },
      },
      { upsert: true, new: true, projection: { role: 1, status: 1, joinedAt: 1 } },
    ).lean();

    await User.updateOne({ _id: userObjectId }, { $set: { role, isActive: true, workspaceId: workspaceObjectId } });
    if (role === 'owner') {
      await Workspace.updateOne({ _id: workspaceObjectId }, { $set: { ownerId: userObjectId } });
    } else if (String(workspace.ownerId || '') === String(userObjectId)) {
      await Workspace.updateOne({ _id: workspaceObjectId }, { $set: { ownerId: null } });
    }

    const response = {
      userId: String(userObjectId),
      workspaceId: String(workspaceObjectId),
      name: user.displayName || 'Unknown',
      email: user.email || '',
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt,
    };
    emitSuperAdminUsersUpdated(io, {
      action: 'role_updated',
      workspaceId: String(workspaceObjectId),
      userId: String(userObjectId),
      role: member.role,
    });
    return response;
  },

  async updateWorkspacePlan({ workspaceId, plan }) {
    const workspaceObjectId = new Types.ObjectId(workspaceId);
    const nextPlan = planLimitsService.normalizePlan(plan);
    const workspace = await Workspace.findByIdAndUpdate(
      workspaceObjectId,
      { $set: { plan: nextPlan } },
      { new: true, projection: { _id: 1, name: 1, slug: 1, plan: 1, timezone: 1, updatedAt: 1 } },
    ).lean();
    if (!workspace) {
      throw new ApiError(404, 'Workspace not found', 'NOT_FOUND');
    }
    return {
      workspaceId: String(workspace._id),
      name: workspace.name || 'Workspace',
      slug: workspace.slug || '',
      plan: planLimitsService.normalizePlan(workspace.plan),
      timezone: workspace.timezone || 'UTC',
      updatedAt: workspace.updatedAt,
    };
  },

  async removeWorkspaceUser({ workspaceId, userId, io }) {
    const response = await removeWorkspaceMembership({ workspaceId, userId, throwIfMissing: true });
    emitSuperAdminUsersUpdated(io, {
      action: 'user_removed',
      workspaceId: response.workspaceId,
      userId: response.userId,
    });
    return response;
  },

  async bulkRemoveWorkspaceUsers({ users = [], io }) {
    const uniqueUsers = [];
    const seen = new Set();
    for (const item of users) {
      const key = `${item.workspaceId}:${item.userId}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueUsers.push(item);
      }
    }

    const results = [];
    for (const item of uniqueUsers) {
      try {
        const result = await removeWorkspaceMembership({
          workspaceId: item.workspaceId,
          userId: item.userId,
          throwIfMissing: false,
        });
        results.push(result);
      } catch (error) {
        results.push({
          removed: false,
          userId: item.userId,
          workspaceId: item.workspaceId,
          reason: error.code || 'remove_failed',
        });
      }
    }

    const response = {
      removedCount: results.filter((item) => item.removed).length,
      skippedCount: results.filter((item) => !item.removed).length,
      items: results,
    };
    emitSuperAdminUsersUpdated(io, {
      action: 'bulk_remove',
      removedCount: response.removedCount,
      skippedCount: response.skippedCount,
    });
    return response;
  },
};
