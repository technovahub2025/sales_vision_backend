import mongoose from 'mongoose';
import { Task } from '../../models/task.model.js';
import { Project } from '../../models/project.model.js';
import { Lead } from '../../models/lead.model.js';
import { Employee } from '../../models/employee.model.js';
import { Activity } from '../../models/activity.model.js';
import { User } from '../../models/user.model.js';
import { appendActivity } from '../activity/activity.service.js';
import { emitDomainEvent } from '../../sockets/emitters.js';
import { LruCache } from '../../utils/lruCache.js';

const dashboardCache = new LruCache({ max: 300, ttlMs: 60000 });
const FINAL_STATUSES = new Set(['completed', 'done', 'won', 'lost', 'closed']);
const ONE_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date = new Date()) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function dateRangeForWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = startOfDay(new Date(now.getTime() + diff * ONE_DAY));
  const end = new Date(start.getTime() + 7 * ONE_DAY);
  return { start, end };
}

function cacheKey({ workspaceId, view, userId }) {
  return `${workspaceId}:${view}:${userId || 'workspace'}`;
}

function safeObjectId(value) {
  if (!value) return null;
  try {
    return new mongoose.Types.ObjectId(String(value));
  } catch {
    return null;
  }
}

function requireWorkspaceObjectId(workspaceId) {
  const value = safeObjectId(workspaceId);
  if (!value) {
    const error = new Error('Invalid workspaceId');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  return value;
}

function requireUserObjectId(userId) {
  const value = safeObjectId(userId);
  if (!value) {
    const error = new Error('Invalid userId');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  return value;
}

function shallowDiff(previous = {}, next = {}) {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const diff = {};
  for (const key of keys) {
    const left = JSON.stringify(previous[key]);
    const right = JSON.stringify(next[key]);
    if (left !== right) {
      diff[key] = next[key];
    }
  }
  return diff;
}

async function buildPortfolioHealth(workspaceId) {
  const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
  const [result] = await Project.aggregate([
    { $match: { workspaceId: workspaceObjectId } },
    {
      $lookup: {
        from: 'sv_tasks',
        let: { projectId: '$_id', ws: '$workspaceId' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$workspaceId', '$$ws'] }, { $eq: ['$projectId', '$$projectId'] }] } } },
          { $project: { status: 1, dueDate: 1 } },
        ],
        as: 'tasks',
      },
    },
    {
      $project: {
        status: 1,
        overdueTaskCount: {
          $size: {
            $filter: {
              input: '$tasks',
              as: 'task',
              cond: {
                $and: [
                  { $lt: ['$$task.dueDate', new Date()] },
                  { $not: { $in: ['$$task.status', ['completed', 'done', 'won', 'lost', 'closed']] } },
                ],
              },
            },
          },
        },
        totalTaskCount: { $size: '$tasks' },
        completedTaskCount: {
          $size: {
            $filter: {
              input: '$tasks',
              as: 'task',
              cond: { $in: ['$$task.status', ['completed', 'done', 'won', 'lost', 'closed']] },
            },
          },
        },
      },
    },
    {
      $group: {
        _id: null,
        totalProjects: { $sum: 1 },
        activeProjects: {
          $sum: {
            $cond: [{ $in: ['$status', ['active', 'in_progress', 'planning']] }, 1, 0],
          },
        },
        completedProjects: {
          $sum: {
            $cond: [{ $in: ['$status', ['completed', 'done', 'closed']] }, 1, 0],
          },
        },
        overdueProjects: {
          $sum: { $cond: [{ $gt: ['$overdueTaskCount', 0] }, 1, 0] },
        },
        totalTasks: { $sum: '$totalTaskCount' },
        completedTasks: { $sum: '$completedTaskCount' },
      },
    },
    {
      $project: {
        _id: 0,
        totalProjects: 1,
        activeProjects: 1,
        completedProjects: 1,
        overdueProjects: 1,
        healthPercent: {
          $cond: [{ $eq: ['$totalTasks', 0] }, 0, { $round: [{ $multiply: [{ $divide: ['$completedTasks', '$totalTasks'] }, 100] }, 1] }],
        },
      },
    },
  ]);

  return result || { totalProjects: 0, activeProjects: 0, completedProjects: 0, overdueProjects: 0, healthPercent: 0 };
}

async function buildTeamVelocity(workspaceId) {
  const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
  const { start, end } = dateRangeForWeek();
  const previousStart = new Date(start.getTime() - 7 * ONE_DAY);
  const previousEnd = start;

  const [result] = await Task.aggregate([
    { $match: { workspaceId: workspaceObjectId } },
    {
      $group: {
        _id: null,
        sprintPointsDone: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $in: ['$status', ['completed', 'done']] },
                  { $gte: ['$updatedAt', start] },
                  { $lt: ['$updatedAt', end] },
                ],
              },
              '$points',
              0,
            ],
          },
        },
        sprintPointsTotal: {
          $sum: {
            $cond: [
              { $and: [{ $gte: ['$updatedAt', start] }, { $lt: ['$updatedAt', end] }] },
              '$points',
              0,
            ],
          },
        },
        previousSprintPointsDone: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $in: ['$status', ['completed', 'done']] },
                  { $gte: ['$updatedAt', previousStart] },
                  { $lt: ['$updatedAt', previousEnd] },
                ],
              },
              '$points',
              0,
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        sprintPointsDone: { $ifNull: ['$sprintPointsDone', 0] },
        sprintPointsTotal: { $ifNull: ['$sprintPointsTotal', 0] },
        velocityTrend: { $subtract: [{ $ifNull: ['$sprintPointsDone', 0] }, { $ifNull: ['$previousSprintPointsDone', 0] }] },
      },
    },
  ]);

  return result || { sprintPointsDone: 0, sprintPointsTotal: 0, velocityTrend: 0 };
}

async function buildEfficiencyGap(workspaceId) {
  const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
  const [result] = await Task.aggregate([
    { $match: { workspaceId: workspaceObjectId } },
    {
      $group: {
        _id: null,
        avgEstimatedHours: { $avg: '$estimateHours' },
        avgActualHours: { $avg: { $ifNull: ['$totalTimeLogged', '$estimateHours'] } },
      },
    },
    {
      $project: {
        _id: 0,
        avgEstimatedHours: { $round: [{ $ifNull: ['$avgEstimatedHours', 0] }, 2] },
        avgActualHours: { $round: [{ $ifNull: ['$avgActualHours', 0] }, 2] },
        gapPercent: {
          $cond: [
            { $lte: [{ $ifNull: ['$avgEstimatedHours', 0] }, 0] },
            0,
            {
              $round: [
                {
                  $multiply: [
                    {
                      $divide: [
                        { $subtract: [{ $ifNull: ['$avgActualHours', 0] }, { $ifNull: ['$avgEstimatedHours', 0] }] },
                        { $ifNull: ['$avgEstimatedHours', 0] },
                      ],
                    },
                    100,
                  ],
                },
                2,
              ],
            },
          ],
        },
      },
    },
  ]);

  return result || { avgEstimatedHours: 0, avgActualHours: 0, gapPercent: 0 };
}

async function buildResourceRoi(workspaceId) {
  const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
  const [result] = await Lead.aggregate([
    { $match: { workspaceId: workspaceObjectId } },
    {
      $facet: {
        leadMetrics: [
          {
            $group: {
              _id: null,
              leadsWon: {
                $sum: {
                  $cond: [{ $in: ['$stage', ['won', 'closed_won']] }, 1, 0],
                },
              },
              totalLeadValue: { $sum: { $ifNull: ['$value', 0] } },
            },
          },
        ],
        employeeCapacity: [
          { $match: { status: { $ne: 'inactive' } } },
          {
            $group: {
              _id: null,
              totalCapacityHours: {
                $sum: {
                  $ifNull: ['$capacity.hoursPerWeek', 40],
                },
              },
            },
          },
        ],
      },
    },
    {
      $project: {
        _id: 0,
        leadsWon: { $ifNull: [{ $first: '$leadMetrics.leadsWon' }, 0] },
        totalLeadValue: { $ifNull: [{ $first: '$leadMetrics.totalLeadValue' }, 0] },
        totalCapacityHours: { $ifNull: [{ $first: '$employeeCapacity.totalCapacityHours' }, 0] },
      },
    },
    {
      $project: {
        leadsWon: 1,
        totalCapacityHours: 1,
        roiRatio: {
          $cond: [{ $lte: ['$totalCapacityHours', 0] }, 0, { $round: [{ $divide: ['$totalLeadValue', '$totalCapacityHours'] }, 2] }],
        },
      },
    },
  ]);

  return result || { leadsWon: 0, totalCapacityHours: 0, roiRatio: 0 };
}

async function buildRecentActivity(workspaceId, limit = 10) {
  const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
  const data = await Activity.aggregate([
    { $match: { workspaceId: workspaceObjectId } },
    { $sort: { occurredAt: -1 } },
    { $limit: limit },
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
        as: 'actorUser',
        pipeline: [{ $project: { displayName: 1, avatarUrl: 1 } }],
      },
    },
    {
      $project: {
        _id: 1,
        action: 1,
        entity: 1,
        entityId: 1,
        message: 1,
        occurredAt: 1,
        actor: {
          name: { $ifNull: [{ $first: '$actorUser.displayName' }, '$actor'] },
          avatarUrl: { $ifNull: [{ $first: '$actorUser.avatarUrl' }, ''] },
        },
      },
    },
  ]);
  return data;
}

async function buildUpcomingDeadlines(workspaceId) {
  const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
  const now = new Date();
  const horizon = new Date(now.getTime() + 7 * ONE_DAY);
  return Task.aggregate([
    {
      $match: {
        workspaceId: workspaceObjectId,
        dueDate: { $gte: now, $lte: horizon },
        status: { $nin: [...FINAL_STATUSES] },
      },
    },
    { $sort: { dueDate: 1 } },
    {
      $lookup: {
        from: 'sv_projects',
        let: { pid: '$projectId', ws: '$workspaceId' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$_id', '$$pid'] }, { $eq: ['$workspaceId', '$$ws'] }] } } },
          { $project: { name: 1 } },
        ],
        as: 'project',
      },
    },
    {
      $group: {
        _id: '$projectId',
        projectName: { $first: { $ifNull: [{ $first: '$project.name' }, 'Unknown Project'] } },
        tasks: {
          $push: {
            _id: '$_id',
            title: '$title',
            dueDate: '$dueDate',
            priority: '$priority',
            status: '$status',
          },
        },
      },
    },
    { $project: { _id: 0, projectId: '$_id', projectName: 1, tasks: 1 } },
  ]);
}

async function buildTaskStatusBreakdown(workspaceId) {
  const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
  return Task.aggregate([
    { $match: { workspaceId: workspaceObjectId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    {
      $project: {
        _id: 0,
        statusName: '$_id',
        count: 1,
        color: {
          $switch: {
            branches: [
              { case: { $eq: ['$_id', 'todo'] }, then: '#94A3B8' },
              { case: { $eq: ['$_id', 'in_progress'] }, then: '#2563EB' },
              { case: { $eq: ['$_id', 'in_review'] }, then: '#F59E0B' },
              { case: { $in: ['$_id', ['completed', 'done']] }, then: '#16A34A' },
            ],
            default: '#64748B',
          },
        },
      },
    },
  ]);
}

async function buildTeamWorkload(workspaceId) {
  const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
  return Employee.aggregate([
    { $match: { workspaceId: workspaceObjectId, status: { $ne: 'inactive' } } },
    {
      $lookup: {
        from: 'sv_tasks',
        let: { employeeId: '$_id', ws: '$workspaceId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ['$workspaceId', '$$ws'] }, { $in: ['$$employeeId', '$assigneeIds'] }],
              },
            },
          },
          { $project: { status: 1 } },
        ],
        as: 'assignedTasks',
      },
    },
    {
      $project: {
        _id: 0,
        employeeId: '$_id',
        name: '$name',
        avatar: { $ifNull: ['$avatarUrl', ''] },
        activeTaskCount: {
          $size: {
            $filter: {
              input: '$assignedTasks',
              as: 'task',
              cond: { $not: { $in: ['$$task.status', ['completed', 'done', 'won', 'lost', 'closed']] } },
            },
          },
        },
        utilizationPercent: {
          $min: [100, { $multiply: [{ $size: '$assignedTasks' }, 10] }],
        },
      },
    },
    { $sort: { activeTaskCount: -1, name: 1 } },
  ]);
}

async function buildPersonalStats(workspaceId, userId) {
  const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
  const userObjectId = requireUserObjectId(userId);
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart.getTime() + ONE_DAY);
  const { start: weekStart, end: weekEnd } = dateRangeForWeek();

  const [result] = await Task.aggregate([
    { $match: { workspaceId: workspaceObjectId, assigneeIds: userObjectId } },
    {
      $group: {
        _id: null,
        tasksAssignedToMe: { $sum: 1 },
        tasksCompletedThisWeek: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $in: ['$status', ['completed', 'done']] },
                  { $gte: ['$updatedAt', weekStart] },
                  { $lt: ['$updatedAt', weekEnd] },
                ],
              },
              1,
              0,
            ],
          },
        },
        tasksDueToday: {
          $sum: {
            $cond: [{ $and: [{ $gte: ['$dueDate', todayStart] }, { $lt: ['$dueDate', tomorrowStart] }] }, 1, 0],
          },
        },
        tasksOverdue: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $lt: ['$dueDate', todayStart] },
                  { $not: { $in: ['$status', ['completed', 'done', 'won', 'lost', 'closed']] } },
                ],
              },
              1,
              0,
            ],
          },
        },
        totalTimeLoggedThisWeek: {
          $sum: {
            $cond: [{ $and: [{ $gte: ['$updatedAt', weekStart] }, { $lt: ['$updatedAt', weekEnd] }] }, { $ifNull: ['$totalTimeLogged', 0] }, 0],
          },
        },
      },
    },
    { $project: { _id: 0 } },
  ]);

  return (
    result || {
      tasksAssignedToMe: 0,
      tasksCompletedThisWeek: 0,
      tasksDueToday: 0,
      tasksOverdue: 0,
      totalTimeLoggedThisWeek: 0,
    }
  );
}

async function buildMyUpcomingTasks(workspaceId, userId) {
  const userObjectId = requireUserObjectId(userId);
  return Task.find(
    {
      workspaceId,
      assigneeIds: userObjectId,
      status: { $nin: [...FINAL_STATUSES] },
    },
    { title: 1, dueDate: 1, priority: 1, projectId: 1, status: 1, updatedAt: 1 },
  )
    .sort({ dueDate: 1, updatedAt: -1 })
    .limit(5)
    .lean();
}

async function buildMyRecentActivity(workspaceId, userId) {
  return Activity.find(
    {
      workspaceId,
      $or: [{ 'payload.actorId': String(userId) }, { actor: String(userId) }],
    },
    { action: 1, entity: 1, entityId: 1, message: 1, occurredAt: 1 },
  )
    .sort({ occurredAt: -1 })
    .limit(10)
    .lean();
}

async function buildMyWorkloadByProject(workspaceId, userId) {
  const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
  const userObjectId = requireUserObjectId(userId);
  return Task.aggregate([
    { $match: { workspaceId: workspaceObjectId, assigneeIds: userObjectId } },
    { $group: { _id: '$projectId', taskCount: { $sum: 1 } } },
    {
      $lookup: {
        from: 'sv_projects',
        let: { pid: '$_id', ws: workspaceObjectId },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$_id', '$$pid'] }, { $eq: ['$workspaceId', '$$ws'] }] } } },
          { $project: { name: 1 } },
        ],
        as: 'project',
      },
    },
    {
      $project: {
        _id: 0,
        projectId: '$_id',
        projectName: { $ifNull: [{ $first: '$project.name' }, 'Unknown Project'] },
        taskCount: 1,
      },
    },
    { $sort: { taskCount: -1 } },
  ]);
}

async function computeWorkspaceDashboard(workspaceId) {
  const [portfolioHealth, teamVelocity, efficiencyGap, resourceROI, recentActivity, upcomingDeadlines, taskStatusBreakdown, teamWorkload] = await Promise.all([
    buildPortfolioHealth(workspaceId),
    buildTeamVelocity(workspaceId),
    buildEfficiencyGap(workspaceId),
    buildResourceRoi(workspaceId),
    buildRecentActivity(workspaceId, 10),
    buildUpcomingDeadlines(workspaceId),
    buildTaskStatusBreakdown(workspaceId),
    buildTeamWorkload(workspaceId),
  ]);

  return {
    view: 'workspace',
    portfolioHealth,
    teamVelocity,
    efficiencyGap,
    resourceROI,
    recentActivity,
    upcomingDeadlines,
    taskStatusBreakdown,
    teamWorkload,
    generatedAt: new Date().toISOString(),
    version: Date.now(),
    kpis: [
      { key: 'portfolioHealth', title: 'Portfolio Health', value: `${portfolioHealth.healthPercent}%`, delta: `${portfolioHealth.completedProjects}/${portfolioHealth.totalProjects}`, trend: 'up' },
      { key: 'teamVelocity', title: 'Team Velocity', value: `${teamVelocity.sprintPointsDone}`, delta: `${teamVelocity.velocityTrend >= 0 ? '+' : ''}${teamVelocity.velocityTrend}`, trend: teamVelocity.velocityTrend >= 0 ? 'up' : 'down' },
      { key: 'efficiencyGap', title: 'Efficiency Gap', value: `${efficiencyGap.gapPercent}%`, delta: `${efficiencyGap.avgActualHours}h`, trend: efficiencyGap.gapPercent <= 0 ? 'up' : 'down' },
      { key: 'resourceRoi', title: 'Resource ROI', value: `${resourceROI.roiRatio}`, delta: `${resourceROI.leadsWon} won`, trend: 'up' },
    ],
    risk: {
      capacityPct: Math.max(...teamWorkload.map((member) => member.utilizationPercent), 0),
      scopeDriftPct: Math.max(efficiencyGap.gapPercent, 0),
      alerts: [],
    },
    priorityActions: upcomingDeadlines.flatMap((entry) =>
      entry.tasks.map((task) => ({
        taskId: String(task._id),
        taskTitle: task.title,
        projectName: entry.projectName,
        assignee: { name: 'Unassigned', avatarUrl: '' },
        status: task.status,
        timeline: new Date(task.dueDate).toLocaleDateString(),
        actionId: `deadline-${task._id}`,
      })),
    ).slice(0, 8),
    heatmap: { rows: [], columns: [], cells: [] },
  };
}

async function computePersonalDashboard(workspaceId, userId) {
  const [myStats, myUpcomingTasks, myRecentActivity, myWorkloadByProject] = await Promise.all([
    buildPersonalStats(workspaceId, userId),
    buildMyUpcomingTasks(workspaceId, userId),
    buildMyRecentActivity(workspaceId, userId),
    buildMyWorkloadByProject(workspaceId, userId),
  ]);

  return {
    view: 'personal',
    myStats,
    myUpcomingTasks,
    myRecentActivity,
    myWorkloadByProject,
    generatedAt: new Date().toISOString(),
    version: Date.now(),
  };
}

export async function invalidateDashboardCache({ workspaceId, io, trigger = 'unknown', userId = null }) {
  const previousWorkspace = dashboardCache.get(cacheKey({ workspaceId, view: 'workspace', userId: null }));
  dashboardCache.deleteByPrefix(`${workspaceId}:workspace:`);
  if (userId) {
    dashboardCache.deleteByPrefix(`${workspaceId}:personal:${userId}`);
  } else {
    dashboardCache.deleteByPrefix(`${workspaceId}:personal:`);
  }

  if (!io) return;
  const nextWorkspace = await computeWorkspaceDashboard(workspaceId);
  const diff = shallowDiff(previousWorkspace || {}, nextWorkspace);
  dashboardCache.set(cacheKey({ workspaceId, view: 'workspace', userId: null }), nextWorkspace);
  emitDomainEvent(io, {
    workspaceId,
    moduleName: 'dashboard',
    entity: 'dashboard',
    action: 'updated',
    data: { view: 'workspace', trigger, diff },
  });
}

export const dashboardService = {
  async get({ workspaceId, view = 'workspace', userId = null }) {
    const nextView = view === 'personal' ? 'personal' : 'workspace';
    const key = cacheKey({ workspaceId, view: nextView, userId });
    const cached = dashboardCache.get(key);
    if (cached) {
      return { ...cached, cacheHit: true };
    }

    const data =
      nextView === 'personal'
        ? await computePersonalDashboard(workspaceId, userId)
        : await computeWorkspaceDashboard(workspaceId);
    dashboardCache.set(key, data);
    return { ...data, cacheHit: false };
  },

  async exportReport({ workspaceId, format = 'pdf', io }) {
    const generatedAt = new Date().toISOString();
    const exportId = `exp_${Date.now()}`;
    const data = {
      exportId,
      format,
      generatedAt,
      payloadRef: `dashboard-report-${workspaceId}-${exportId}`,
      downloadUrl: null,
    };

    await appendActivity({
      workspaceId,
      module: 'dashboard',
      action: 'exported',
      entity: 'dashboard_report',
      entityId: exportId,
      message: `Dashboard report export requested (${format})`,
      payload: data,
    });

    await invalidateDashboardCache({ workspaceId, io, trigger: 'dashboard.exported' });
    return data;
  },

  async strategyMeeting({ workspaceId, io }) {
    const createdAt = new Date().toISOString();
    const meetingId = `meet_${Date.now()}`;
    const data = {
      meetingId,
      createdAt,
      status: 'scheduled',
    };

    await appendActivity({
      workspaceId,
      module: 'dashboard',
      action: 'strategy_meeting_created',
      entity: 'strategy_meeting',
      entityId: meetingId,
      message: 'Strategy meeting created from executive dashboard',
      payload: data,
    });

    await invalidateDashboardCache({ workspaceId, io, trigger: 'dashboard.strategy_meeting_created' });
    return data;
  },
};
