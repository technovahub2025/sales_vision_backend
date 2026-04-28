import mongoose from 'mongoose';
import { AnalyticsSnapshot } from '../../models/analyticsSnapshot.model.js';
import { Task } from '../../models/task.model.js';
import { Project } from '../../models/project.model.js';
import { Sprint } from '../../models/sprint.model.js';
import { User } from '../../models/user.model.js';
import { Lead } from '../../models/lead.model.js';
import { Campaign } from '../../models/campaign.model.js';
import { Client } from '../../models/client.model.js';
import { Employee } from '../../models/employee.model.js';
import { TimeLog } from '../../models/timeLog.model.js';
import { createCrudService } from '../createCrudService.js';
import { LruCache } from '../../utils/lruCache.js';

const FINAL_STATUSES = new Set(['completed', 'done', 'won', 'lost', 'closed']);
const ONE_DAY = 24 * 60 * 60 * 1000;
const cache = new LruCache({ max: 300, ttlMs: 120 * 1000 });
const LEAD_STATUS_ORDER = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost'];
const OWNER_ADMIN_ROLES = new Set(['owner', 'admin']);

function startOfDay(date = new Date()) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date = new Date()) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function startOfWeek(date = new Date()) {
  const now = startOfDay(date);
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return startOfDay(new Date(now.getTime() + diff * ONE_DAY));
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function safeDate(input) {
  if (!input) return null;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toObjectId(value) {
  if (!value) return null;
  try {
    return new mongoose.Types.ObjectId(String(value));
  } catch {
    return null;
  }
}

function requireWorkspaceObjectId(workspaceId) {
  const value = toObjectId(workspaceId);
  if (!value) {
    const error = new Error('Invalid workspaceId');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  return value;
}

function buildDateRange(query = {}) {
  const now = new Date();
  const defaultTo = endOfDay(now);
  const defaultFrom = startOfDay(new Date(defaultTo.getTime() - 29 * ONE_DAY));

  const requestedFrom = safeDate(query.dateFrom);
  const requestedTo = safeDate(query.dateTo);

  let dateFrom = requestedFrom ? startOfDay(requestedFrom) : defaultFrom;
  let dateTo = requestedTo ? endOfDay(requestedTo) : defaultTo;

  if (dateFrom > dateTo) {
    [dateFrom, dateTo] = [dateTo, dateFrom];
  }

  return {
    dateFrom,
    dateTo,
    dateFromIso: dateFrom.toISOString(),
    dateToIso: dateTo.toISOString(),
    rangeDays: Math.max(1, Math.ceil((dateTo.getTime() - dateFrom.getTime() + 1) / ONE_DAY)),
  };
}

function parseFilters(query = {}) {
  const normalize = (value) => String(value || '').trim().toLowerCase();
  const module = normalize(query.module);
  const status = normalize(query.status);
  const channel = normalize(query.channel);
  const priority = normalize(query.priority);
  const groupBy = normalize(query.groupBy) || 'day';
  const limit = clampNumber(query.limit, 1, 25, 8);

  return {
    module: module || 'all',
    status: status || '',
    channel: channel || '',
    priority: priority || '',
    groupBy,
    limit,
  };
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function percentage(numerator, denominator) {
  if (!denominator) return 0;
  return round((Number(numerator || 0) / Number(denominator || 1)) * 100, 2);
}

function cacheKey(prefix, workspaceId, query = {}, userId = '') {
  const payload = JSON.stringify({
    workspaceId: String(workspaceId),
    query,
    userId: String(userId || ''),
  });
  return `${prefix}:${payload}`;
}

export function invalidateAnalyticsCache(workspaceId) {
  if (!workspaceId) return;
  cache.deleteByPrefix(`overview:{"workspaceId":"${String(workspaceId)}`);
}

function toCsvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (!text.includes(',') && !text.includes('"') && !text.includes('\n')) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function sectionRowsToCsv(title, rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return `${title}\nNo data\n`;
  }
  const headers = Object.keys(rows[0]);
  const lines = [title, headers.map(toCsvCell).join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => toCsvCell(row[header])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildDateKeysInRange(dateFrom, rangeDays) {
  const keys = [];
  for (let i = 0; i < rangeDays; i += 1) {
    const day = new Date(dateFrom.getTime() + i * ONE_DAY);
    keys.push(day.toISOString().slice(0, 10));
  }
  return keys;
}

async function buildVelocitySeries(workspaceId) {
  const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
  const series = [];
  const now = new Date();
  const currentWeekStart = startOfWeek(now);

  for (let i = 4; i >= 0; i -= 1) {
    const start = new Date(currentWeekStart.getTime() - i * 7 * ONE_DAY);
    const end = new Date(start.getTime() + 7 * ONE_DAY);
    // eslint-disable-next-line no-await-in-loop
    const points = await Task.aggregate([
      { $match: { workspaceId: workspaceObjectId, archived: { $ne: true } } },
      {
        $group: {
          _id: null,
          donePoints: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$status', Array.from(FINAL_STATUSES)] },
                    { $gte: ['$updatedAt', start] },
                    { $lt: ['$updatedAt', end] },
                  ],
                },
                '$points',
                0,
              ],
            },
          },
        },
      },
      { $project: { _id: 0, donePoints: { $ifNull: ['$donePoints', 0] } } },
    ]);
    series.push({ label: start.toISOString().slice(5, 10), value: points?.[0]?.donePoints || 0 });
  }

  return series;
}

async function buildTeamWorkloadHeatmap(workspaceId) {
  const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
  const end = startOfDay(new Date());
  const start = new Date(end.getTime() - 6 * ONE_DAY);

  const users = await User.find({ workspaceId, isActive: true }, { displayName: 1, avatarUrl: 1 }).lean();
  const userIds = users.map((user) => user._id);

  if (!userIds.length) {
    return { rows: [], columns: [], cells: [] };
  }

  const activity = await Task.aggregate([
    {
      $match: {
        workspaceId: workspaceObjectId,
        archived: { $ne: true },
        updatedAt: { $gte: start, $lte: new Date(end.getTime() + ONE_DAY) },
        assigneeIds: { $in: userIds },
      },
    },
    { $unwind: '$assigneeIds' },
    {
      $project: {
        assigneeId: '$assigneeIds',
        day: {
          $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' },
        },
      },
    },
    {
      $group: {
        _id: { assigneeId: '$assigneeId', day: '$day' },
        count: { $sum: 1 },
      },
    },
  ]);

  const columns = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(start.getTime() + i * ONE_DAY);
    columns.push(day.toISOString().slice(5, 10));
  }

  const rows = users.map((user) => ({ id: String(user._id), name: user.displayName || 'Member', avatarUrl: user.avatarUrl || '' }));
  const cells = [];
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    for (let c = 0; c < columns.length; c += 1) {
      const dayKey = new Date(start.getTime() + c * ONE_DAY).toISOString().slice(0, 10);
      const hit = activity.find((item) => String(item._id.assigneeId) === row.id && item._id.day === dayKey);
      cells.push({ r, c, intensity: Math.min(3, Math.floor((hit?.count || 0) / 2) + (hit?.count ? 1 : 0)) });
    }
  }

  return { rows, columns, cells };
}

async function buildActiveSprintProgress(workspaceId) {
  const sprint = await Sprint.findOne({ workspaceId, status: 'active' }, { _id: 1, name: 1, endDate: 1 }).lean();
  if (!sprint) return null;

  const total = await Task.countDocuments({ workspaceId, sprintId: sprint._id, archived: { $ne: true } });
  const done = await Task.countDocuments({ workspaceId, sprintId: sprint._id, archived: { $ne: true }, status: { $in: Array.from(FINAL_STATUSES) } });

  return {
    sprintId: String(sprint._id),
    name: sprint.name,
    total,
    done,
    remaining: Math.max(total - done, 0),
    daysLeft: sprint.endDate ? Math.max(0, Math.ceil((new Date(sprint.endDate).getTime() - Date.now()) / ONE_DAY)) : null,
  };
}

async function buildProjectHealth(workspaceId, query = {}) {
  const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
  const { dateFrom, dateTo } = buildDateRange(query);

  const projects = await Project.aggregate([
    { $match: { workspaceId: workspaceObjectId } },
    {
      $lookup: {
        from: 'sv_tasks',
        let: { projectId: '$_id', ws: '$workspaceId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$workspaceId', '$$ws'] },
                  { $eq: ['$projectId', '$$projectId'] },
                  { $ne: ['$archived', true] },
                ],
              },
              updatedAt: { $gte: dateFrom, $lte: dateTo },
            },
          },
          { $project: { status: 1, dueDate: 1, updatedAt: 1 } },
        ],
        as: 'tasks',
      },
    },
    {
      $project: {
        _id: 1,
        name: 1,
        metadata: 1,
        total: { $size: '$tasks' },
        completed: {
          $size: {
            $filter: {
              input: '$tasks',
              as: 'task',
              cond: { $in: ['$$task.status', Array.from(FINAL_STATUSES)] },
            },
          },
        },
        overdue: {
          $size: {
            $filter: {
              input: '$tasks',
              as: 'task',
              cond: {
                $and: [
                  { $lt: ['$$task.dueDate', new Date()] },
                  { $not: { $in: ['$$task.status', Array.from(FINAL_STATUSES)] } },
                ],
              },
            },
          },
        },
        lastActivity: { $max: '$tasks.updatedAt' },
      },
    },
  ]);

  return projects.map((project) => ({
    projectId: String(project._id),
    name: project.name,
    color: project?.metadata?.color || '#94a3b8',
    completionPct: project.total ? Math.round((project.completed / project.total) * 100) : 0,
    overdueCount: project.overdue || 0,
    lastActivity: project.lastActivity || null,
  }));
}

async function buildWorkspace360(workspaceId, query = {}, context = {}) {
  const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
  const dateRange = buildDateRange(query);
  const filters = parseFilters(query);
  const now = new Date();

  const taskMatch = {
    workspaceId: workspaceObjectId,
    archived: { $ne: true },
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };

  const leadMatch = {
    workspaceId: workspaceObjectId,
    isArchived: { $ne: true },
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.status ? { statusId: filters.status } : {}),
    ...(filters.channel ? { source: filters.channel } : {}),
  };

  const campaignMatch = {
    workspaceId: workspaceObjectId,
    isArchived: { $ne: true },
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.channel ? { channel: filters.channel } : {}),
  };

  const clientMatch = {
    workspaceId: workspaceObjectId,
    isArchived: { $ne: true },
  };

  const [
    openTasks,
    overdueTasks,
    completedThisWeek,
    velocitySeries,
    activeSprint,
    teamWorkload,
    projectHealth,
    taskTotals,
    plannedVsActual,
    overdueTrendRaw,
    completionTrendRaw,
    leadsByStageRaw,
    leadTotalsRaw,
    campaignTotalsRaw,
    topProjectsRaw,
    topCampaignsRaw,
    topOwnersRaw,
    topClientsRaw,
    employeeAvailabilityRaw,
    employeeStatsRaw,
    timeLogsByEmployeeRaw,
    clientsCurrentWindow,
    clientsPreviousWindow,
    projectsCount,
    campaignsCount,
    leadsCount,
    clientsCount,
    employeesCount,
  ] = await Promise.all([
    Task.countDocuments({ ...taskMatch, status: { $nin: Array.from(FINAL_STATUSES) } }),
    Task.countDocuments({ ...taskMatch, status: { $nin: Array.from(FINAL_STATUSES) }, dueDate: { $lt: now } }),
    Task.countDocuments({
      ...taskMatch,
      status: { $in: Array.from(FINAL_STATUSES) },
      updatedAt: { $gte: startOfWeek(now), $lt: new Date(startOfWeek(now).getTime() + 7 * ONE_DAY) },
    }),
    buildVelocitySeries(workspaceId),
    buildActiveSprintProgress(workspaceId),
    buildTeamWorkloadHeatmap(workspaceId),
    buildProjectHealth(workspaceId, query),
    Task.aggregate([
      {
        $match: {
          ...taskMatch,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $in: ['$status', Array.from(FINAL_STATUSES)] }, 1, 0] } },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lt: ['$dueDate', now] },
                    { $not: { $in: ['$status', Array.from(FINAL_STATUSES)] } },
                  ],
                },
                1,
                0,
              ],
            },
          },
          open: { $sum: { $cond: [{ $in: ['$status', Array.from(FINAL_STATUSES)] }, 0, 1] } },
        },
      },
    ]),
    Task.aggregate([
      {
        $match: {
          ...taskMatch,
          updatedAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo },
        },
      },
      {
        $group: {
          _id: null,
          plannedHours: { $sum: { $ifNull: ['$estimateHours', 0] } },
          actualHours: { $sum: { $divide: [{ $ifNull: ['$totalTimeLogged', 0] }, 60] } },
        },
      },
    ]),
    Task.aggregate([
      {
        $match: {
          ...taskMatch,
          dueDate: { $exists: true, $ne: null },
          updatedAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lt: ['$dueDate', now] },
                    { $not: { $in: ['$status', Array.from(FINAL_STATUSES)] } },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Task.aggregate([
      {
        $match: {
          ...taskMatch,
          updatedAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $in: ['$status', Array.from(FINAL_STATUSES)] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Lead.aggregate([
      {
        $match: {
          ...leadMatch,
        },
      },
      { $group: { _id: '$statusId', count: { $sum: 1 }, value: { $sum: { $ifNull: ['$value', 0] } } } },
    ]),
    Lead.aggregate([
      {
        $match: {
          ...leadMatch,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          won: { $sum: { $cond: [{ $eq: ['$statusId', 'won'] }, 1, 0] } },
          totalValue: { $sum: { $ifNull: ['$value', 0] } },
        },
      },
    ]),
    Campaign.aggregate([
      {
        $match: {
          ...campaignMatch,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          totalSpend: { $sum: { $ifNull: ['$spend', 0] } },
          avgRoi: { $avg: { $ifNull: ['$roi', 0] } },
          avgConversionRate: { $avg: { $ifNull: ['$conversionRate', 0] } },
        },
      },
    ]),
    Project.aggregate([
      { $match: { workspaceId: workspaceObjectId } },
      {
        $lookup: {
          from: 'sv_tasks',
          let: { projectId: '$_id', ws: '$workspaceId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$workspaceId', '$$ws'] },
                    { $eq: ['$projectId', '$$projectId'] },
                    { $ne: ['$archived', true] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalTasks: { $sum: 1 },
                completedTasks: { $sum: { $cond: [{ $in: ['$status', Array.from(FINAL_STATUSES)] }, 1, 0] } },
              },
            },
          ],
          as: 'taskStats',
        },
      },
      {
        $project: {
          name: 1,
          status: 1,
          progress: { $ifNull: ['$progress', 0] },
          totalTasks: { $ifNull: [{ $arrayElemAt: ['$taskStats.totalTasks', 0] }, 0] },
          completedTasks: { $ifNull: [{ $arrayElemAt: ['$taskStats.completedTasks', 0] }, 0] },
          updatedAt: 1,
        },
      },
      { $sort: { progress: -1, updatedAt: -1 } },
      { $limit: Math.max(filters.limit, 5) },
    ]),
    Campaign.aggregate([
      { $match: { ...campaignMatch } },
      {
        $project: {
          name: 1,
          status: 1,
          spend: { $ifNull: ['$spend', 0] },
          roi: { $ifNull: ['$roi', 0] },
          conversionRate: { $ifNull: ['$conversionRate', 0] },
          updatedAt: 1,
        },
      },
      { $sort: { conversionRate: -1, spend: -1, updatedAt: -1 } },
      { $limit: Math.max(filters.limit, 5) },
    ]),
    Task.aggregate([
      {
        $match: {
          ...taskMatch,
          primaryAssigneeId: { $ne: null },
        },
      },
      {
        $group: {
          _id: '$primaryAssigneeId',
          taskCount: { $sum: 1 },
          completed: { $sum: { $cond: [{ $in: ['$status', Array.from(FINAL_STATUSES)] }, 1, 0] } },
        },
      },
      {
        $lookup: {
          from: 'sv_users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $project: {
          userId: '$_id',
          name: { $ifNull: [{ $arrayElemAt: ['$user.displayName', 0] }, 'Member'] },
          taskCount: 1,
          completionRate: {
            $cond: [{ $gt: ['$taskCount', 0] }, { $multiply: [{ $divide: ['$completed', '$taskCount'] }, 100] }, 0],
          },
        },
      },
      { $sort: { taskCount: -1 } },
      { $limit: Math.max(filters.limit, 5) },
    ]),
    Lead.aggregate([
      {
        $match: {
          ...leadMatch,
          clientId: { $ne: null },
        },
      },
      { $group: { _id: '$clientId', leadCount: { $sum: 1 }, value: { $sum: { $ifNull: ['$value', 0] } } } },
      {
        $lookup: {
          from: 'sv_clients',
          localField: '_id',
          foreignField: '_id',
          as: 'client',
        },
      },
      {
        $project: {
          clientId: '$_id',
          name: { $ifNull: [{ $arrayElemAt: ['$client.name', 0] }, 'Client'] },
          leadCount: 1,
          value: 1,
        },
      },
      { $sort: { leadCount: -1, value: -1 } },
      { $limit: Math.max(filters.limit, 5) },
    ]),
    Employee.aggregate([
      { $match: { workspaceId: workspaceObjectId } },
      {
        $group: {
          _id: '$availability.status',
          count: { $sum: 1 },
        },
      },
    ]),
    Employee.aggregate([
      { $match: { workspaceId: workspaceObjectId } },
      {
        $group: {
          _id: null,
          avgCapacity: { $avg: { $ifNull: ['$capacity.hoursPerWeek', 40] } },
          avgVelocity: { $avg: { $ifNull: ['$velocity', 0] } },
        },
      },
    ]),
    TimeLog.aggregate([
      {
        $match: {
          workspaceId: workspaceObjectId,
          isDeleted: { $ne: true },
          loggedAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo },
        },
      },
      {
        $group: {
          _id: '$employeeId',
          durationMins: { $sum: { $ifNull: ['$durationMins', 0] } },
        },
      },
    ]),
    Client.countDocuments({ ...clientMatch, createdAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo } }),
    Client.countDocuments({
      ...clientMatch,
      createdAt: { $gte: new Date(dateRange.dateFrom.getTime() - dateRange.rangeDays * ONE_DAY), $lt: dateRange.dateFrom },
    }),
    Project.countDocuments({ workspaceId: workspaceObjectId }),
    Campaign.countDocuments({ ...campaignMatch }),
    Lead.countDocuments({ ...leadMatch }),
    Client.countDocuments({ ...clientMatch }),
    Employee.countDocuments({ workspaceId: workspaceObjectId }),
  ]);

  const taskSummary = taskTotals?.[0] || { total: 0, completed: 0, overdue: 0, open: 0 };
  const plannedActual = plannedVsActual?.[0] || { plannedHours: 0, actualHours: 0 };
  const campaignSummary = campaignTotalsRaw?.[0] || {
    total: 0,
    active: 0,
    totalSpend: 0,
    avgRoi: 0,
    avgConversionRate: 0,
  };
  const leadSummary = leadTotalsRaw?.[0] || { total: 0, won: 0, totalValue: 0 };

  const leadFunnel = LEAD_STATUS_ORDER.map((statusId) => {
    const hit = leadsByStageRaw.find((row) => String(row._id || '').toLowerCase() === statusId);
    return {
      statusId,
      count: Number(hit?.count || 0),
      value: Number(hit?.value || 0),
    };
  });

  const completionTrendMap = new Map(
    completionTrendRaw.map((row) => [
      String(row._id),
      {
        total: Number(row.total || 0),
        completed: Number(row.completed || 0),
      },
    ]),
  );
  const overdueTrendMap = new Map(
    overdueTrendRaw.map((row) => [String(row._id), Number(row.overdue || 0)]),
  );
  const trendDateKeys = buildDateKeysInRange(dateRange.dateFrom, dateRange.rangeDays);
  const completionTrend = trendDateKeys.map((dateKey) => {
    const hit = completionTrendMap.get(dateKey) || { total: 0, completed: 0 };
    return {
      date: dateKey,
      completionRate: percentage(hit.completed, hit.total),
      total: hit.total,
      completed: hit.completed,
    };
  });

  const overdueTrend = trendDateKeys.map((dateKey) => ({
    date: dateKey,
    overdue: Number(overdueTrendMap.get(dateKey) || 0),
  }));

  const availabilityMap = employeeAvailabilityRaw.reduce((acc, row) => {
    acc[String(row._id || 'unknown')] = Number(row.count || 0);
    return acc;
  }, {});

  const employeeStat = employeeStatsRaw?.[0] || { avgCapacity: 40, avgVelocity: 0 };
  const timeByEmployeeMap = timeLogsByEmployeeRaw.reduce((acc, row) => {
    acc[String(row._id)] = Number(row.durationMins || 0);
    return acc;
  }, {});

  const employees = await Employee.find(
    { workspaceId: workspaceObjectId },
    { _id: 1, name: 1, userId: 1, team: 1, capacity: 1, velocity: 1 },
  ).lean();

  const taskAssignments = await Task.aggregate([
    {
      $match: {
        ...taskMatch,
        status: { $nin: Array.from(FINAL_STATUSES) },
        primaryAssigneeId: { $ne: null },
      },
    },
    { $group: { _id: '$primaryAssigneeId', assignedTasks: { $sum: 1 } } },
  ]);

  const assignmentMap = taskAssignments.reduce((acc, row) => {
    acc[String(row._id)] = Number(row.assignedTasks || 0);
    return acc;
  }, {});

  const weeksInRange = Math.max(1, dateRange.rangeDays / 7);
  const assignmentLoad = employees
    .map((employee) => {
      const employeeIdKey = String(employee._id);
      const userIdKey = String(employee.userId || '');
      const loadHours = round((timeByEmployeeMap[employeeIdKey] || 0) / 60, 2);
      const capacityHours = round(Number(employee?.capacity?.hoursPerWeek || 40) * weeksInRange, 2);
      const assignedTasks = assignmentMap[userIdKey] || 0;
      const utilizationPct = capacityHours > 0 ? round((loadHours / capacityHours) * 100, 2) : 0;
      return {
        employeeId: employeeIdKey,
        name: employee.name || 'Employee',
        team: employee.team || 'General',
        assignedTasks,
        loadHours,
        capacityHours,
        utilizationPct,
      };
    })
    .sort((a, b) => b.utilizationPct - a.utilizationPct)
    .slice(0, Math.max(filters.limit, 8));

  const userObjectId = toObjectId(context.userId);
  let myTasksSummary = {
    assigned: 0,
    completed: 0,
    overdue: 0,
    completionRate: 0,
  };

  if (userObjectId) {
    const myTaskStats = await Task.aggregate([
      {
        $match: {
          ...taskMatch,
          assigneeIds: userObjectId,
          updatedAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo },
        },
      },
      {
        $group: {
          _id: null,
          assigned: { $sum: 1 },
          completed: { $sum: { $cond: [{ $in: ['$status', Array.from(FINAL_STATUSES)] }, 1, 0] } },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lt: ['$dueDate', now] },
                    { $not: { $in: ['$status', Array.from(FINAL_STATUSES)] } },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);
    const mine = myTaskStats?.[0] || { assigned: 0, completed: 0, overdue: 0 };
    myTasksSummary = {
      assigned: Number(mine.assigned || 0),
      completed: Number(mine.completed || 0),
      overdue: Number(mine.overdue || 0),
      completionRate: percentage(mine.completed, mine.assigned),
    };
  }

  const clientGrowthPct = clientsPreviousWindow
    ? percentage(clientsCurrentWindow - clientsPreviousWindow, clientsPreviousWindow)
    : clientsCurrentWindow
    ? 100
    : 0;

  return {
    metrics: {
      openTasks,
      overdueTasks,
      completedThisWeek,
      sprintVelocity: velocitySeries[velocitySeries.length - 1]?.value || 0,
    },
    velocitySeries,
    activeSprint,
    teamWorkload,
    projectHealth,
    filters: {
      dateFrom: dateRange.dateFromIso,
      dateTo: dateRange.dateToIso,
      module: filters.module,
      status: filters.status,
      channel: filters.channel,
      priority: filters.priority,
      groupBy: filters.groupBy,
      limit: filters.limit,
      defaultRange: '30d',
    },
    kpis: {
      tasks: {
        total: Number(taskSummary.total || 0),
        open: Number(taskSummary.open || 0),
        completed: Number(taskSummary.completed || 0),
        overdue: Number(taskSummary.overdue || 0),
        completionRate: percentage(taskSummary.completed, taskSummary.total),
      },
      projects: { total: Number(projectsCount || 0), healthy: projectHealth.filter((item) => item.completionPct >= 70).length },
      leads: {
        total: Number(leadsCount || 0),
        funnelTotal: Number(leadSummary.total || 0),
        conversionRate: percentage(leadSummary.won, leadSummary.total),
        won: Number(leadSummary.won || 0),
        pipelineValue: Number(leadSummary.totalValue || 0),
      },
      campaigns: {
        total: Number(campaignsCount || 0),
        active: Number(campaignSummary.active || 0),
        spend: round(campaignSummary.totalSpend, 2),
        averageRoi: round(campaignSummary.avgRoi, 2),
        conversionRate: round(campaignSummary.avgConversionRate, 2),
      },
      employees: {
        total: Number(employeesCount || 0),
        available: Number(availabilityMap.available || 0),
        busy: Number(availabilityMap.busy || 0),
        leave: Number(availabilityMap.leave || 0),
      },
      clients: {
        total: Number(clientsCount || 0),
        addedInRange: Number(clientsCurrentWindow || 0),
        growthPct: clientGrowthPct,
      },
      myTasks: myTasksSummary,
    },
    delivery: {
      completionRate: percentage(taskSummary.completed, taskSummary.total),
      overdueRate: percentage(taskSummary.overdue, taskSummary.total),
      completedTasks: Number(taskSummary.completed || 0),
      overdueTasks: Number(taskSummary.overdue || 0),
      openTasks: Number(taskSummary.open || 0),
      sprintVelocity: Number(velocitySeries[velocitySeries.length - 1]?.value || 0),
      sprintVelocityTrend: velocitySeries,
      completionTrend,
      overdueTrend,
      plannedVsActualHours: {
        plannedHours: round(plannedActual.plannedHours, 2),
        actualHours: round(plannedActual.actualHours, 2),
        varianceHours: round((plannedActual.actualHours || 0) - (plannedActual.plannedHours || 0), 2),
      },
      teamUtilizationPct: assignmentLoad.length
        ? round(assignmentLoad.reduce((sum, row) => sum + Number(row.utilizationPct || 0), 0) / assignmentLoad.length, 2)
        : 0,
    },
    sales: {
      leadFunnel,
      leadConversionRate: percentage(leadSummary.won, leadSummary.total),
      campaign: {
        total: Number(campaignSummary.total || 0),
        active: Number(campaignSummary.active || 0),
        spend: round(campaignSummary.totalSpend, 2),
        averageRoi: round(campaignSummary.avgRoi, 2),
        averageConversionRate: round(campaignSummary.avgConversionRate, 2),
      },
      clients: {
        total: Number(clientsCount || 0),
        addedInRange: Number(clientsCurrentWindow || 0),
        growthPct: clientGrowthPct,
      },
    },
    workforce: {
      headcount: Number(employeesCount || 0),
      availability: {
        available: Number(availabilityMap.available || 0),
        busy: Number(availabilityMap.busy || 0),
        leave: Number(availabilityMap.leave || 0),
        ooo: Number(availabilityMap.ooo || 0),
      },
      avgCapacityHours: round(employeeStat.avgCapacity, 2),
      avgVelocity: round(employeeStat.avgVelocity, 2),
      assignmentLoad,
    },
    topEntities: {
      projects: topProjectsRaw.map((item) => ({
        projectId: String(item._id),
        name: item.name,
        status: item.status || 'active',
        progress: round(item.progress, 2),
        totalTasks: Number(item.totalTasks || 0),
        completedTasks: Number(item.completedTasks || 0),
      })),
      campaigns: topCampaignsRaw.map((item) => ({
        campaignId: String(item._id),
        name: item.name,
        status: item.status || 'draft',
        spend: round(item.spend, 2),
        roi: round(item.roi, 2),
        conversionRate: round(item.conversionRate, 2),
      })),
      owners: topOwnersRaw.map((item) => ({
        userId: String(item.userId || ''),
        name: item.name || 'Member',
        taskCount: Number(item.taskCount || 0),
        completionRate: round(item.completionRate, 2),
      })),
      clients: topClientsRaw.map((item) => ({
        clientId: String(item.clientId || ''),
        name: item.name || 'Client',
        leadCount: Number(item.leadCount || 0),
        value: round(item.value, 2),
      })),
    },
    generatedAt: new Date().toISOString(),
  };
}

function buildCsvExport(data = {}) {
  const sections = [];

  const summaryRows = [
    {
      generatedAt: data.generatedAt || '',
      dateFrom: data?.filters?.dateFrom || '',
      dateTo: data?.filters?.dateTo || '',
      taskCompletionRate: data?.delivery?.completionRate || 0,
      overdueRate: data?.delivery?.overdueRate || 0,
      leadConversionRate: data?.sales?.leadConversionRate || 0,
      campaignAverageRoi: data?.sales?.campaign?.averageRoi || 0,
      headcount: data?.workforce?.headcount || 0,
    },
  ];
  sections.push(sectionRowsToCsv('Summary', summaryRows));

  const leadFunnelRows = safeArray(data?.sales?.leadFunnel).map((row) => ({
    statusId: row.statusId,
    count: row.count,
    value: row.value,
  }));
  sections.push(sectionRowsToCsv('Lead Funnel', leadFunnelRows));

  const projectRows = safeArray(data?.topEntities?.projects).map((row) => ({
    projectId: row.projectId,
    name: row.name,
    status: row.status,
    progress: row.progress,
    totalTasks: row.totalTasks,
    completedTasks: row.completedTasks,
  }));
  sections.push(sectionRowsToCsv('Top Projects', projectRows));

  const campaignRows = safeArray(data?.topEntities?.campaigns).map((row) => ({
    campaignId: row.campaignId,
    name: row.name,
    status: row.status,
    spend: row.spend,
    roi: row.roi,
    conversionRate: row.conversionRate,
  }));
  sections.push(sectionRowsToCsv('Top Campaigns', campaignRows));

  const workforceRows = safeArray(data?.workforce?.assignmentLoad).map((row) => ({
    employeeId: row.employeeId,
    name: row.name,
    team: row.team,
    assignedTasks: row.assignedTasks,
    loadHours: row.loadHours,
    capacityHours: row.capacityHours,
    utilizationPct: row.utilizationPct,
  }));
  sections.push(sectionRowsToCsv('Workforce Assignment Load', workforceRows));

  const completionTrendRows = safeArray(data?.delivery?.completionTrend).map((row) => ({
    date: row.date,
    total: row.total,
    completed: row.completed,
    completionRate: row.completionRate,
  }));
  sections.push(sectionRowsToCsv('Completion Trend', completionTrendRows));

  return sections.join('\n');
}

async function buildOverview(workspaceId, query = {}, context = {}) {
  const key = cacheKey('overview', workspaceId, query, context.userId);
  if (!context.bypassCache) {
    const cached = cache.get(key);
    if (cached) return { ...cached, cacheHit: true };
  }

  const data = await buildWorkspace360(workspaceId, query, context);
  cache.set(key, data);
  return { ...data, cacheHit: false };
}

async function exportAnalytics({ workspaceId, query = {}, role = '', userId = '' }) {
  const normalizedRole = String(role || '').toLowerCase();
  if (!OWNER_ADMIN_ROLES.has(normalizedRole)) {
    const error = new Error('Only owner/admin can export detailed analytics');
    error.statusCode = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  const format = String(query.format || 'json').trim().toLowerCase();
  if (!['json', 'csv'].includes(format)) {
    const error = new Error('Unsupported export format. Use csv or json');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const data = await buildOverview(workspaceId, query, { userId, bypassCache: true });
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    return {
      format,
      filename: `analytics-report-${stamp}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: buildCsvExport(data),
    };
  }

  return {
    format,
    filename: `analytics-report-${stamp}.json`,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(data, null, 2),
  };
}

export const analyticsService = {
  ...createCrudService({
    model: AnalyticsSnapshot,
    moduleName: 'analytics',
    entityName: 'analytics',
  }),
  overview: buildOverview,
  projectHealth: buildProjectHealth,
  exportAnalytics,
};
