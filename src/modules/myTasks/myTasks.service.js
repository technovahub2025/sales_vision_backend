import mongoose from 'mongoose';
import { Task } from '../../models/task.model.js';
import { TaskOrder } from '../../models/taskOrder.model.js';
import { Project } from '../../models/project.model.js';
import { TimeLog } from '../../models/timeLog.model.js';
import { Employee } from '../../models/employee.model.js';
import { User } from '../../models/user.model.js';
import { appendActivity } from '../activity/activity.service.js';
import { emitCoalesced, emitDomainEvent } from '../../sockets/emitters.js';
import { userRoom } from '../../sockets/rooms.js';
import { invalidateDashboardCache } from '../dashboard/dashboard.service.js';
import { workflowService } from '../workflow/workflow.service.js';

const FINAL_STATUSES = new Set(['completed', 'done', 'won', 'lost', 'closed']);
const PRIORITY_WEIGHT = { critical: 4, high: 3, medium: 2, low: 1 };
const GROUP_BY_VALUES = new Set(['dueDate', 'status', 'priority', 'project']);
const DUE_DATE_ORDER = ['overdue', 'today', 'thisWeek', 'upcoming', 'noDueDate'];
const STATUS_ORDER = ['todo', 'in_progress', 'in_review', 'blocked', 'completed', 'done', 'closed'];
const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low', 'none'];

function toDateOnly(input) {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  return date;
}

function categorizeTask(task) {
  if (!task.dueDate) return 'noDueDate';
  const today = toDateOnly(new Date());
  const due = toDateOnly(task.dueDate);
  const diff = Math.floor((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diff < 0 && !FINAL_STATUSES.has(String(task.status || '').toLowerCase())) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 7) return 'thisWeek';
  return 'upcoming';
}

function resolveGroupBy(value) {
  const key = String(value || '').trim();
  if (GROUP_BY_VALUES.has(key)) return key;
  return 'dueDate';
}

function groupKeyForTask(task, groupBy) {
  if (groupBy === 'status') return String(task.status || 'todo');
  if (groupBy === 'priority') return String(task.priority || 'medium');
  if (groupBy === 'project') return String(task.projectId || 'unknown');
  return categorizeTask(task);
}

function labelForGroupKey(groupBy, key, task) {
  if (groupBy === 'status') return String(key || 'todo').replace(/_/g, ' ');
  if (groupBy === 'priority') return String(key || 'medium');
  if (groupBy === 'project') return task?.projectName || 'Unknown project';
  if (key === 'overdue') return 'Overdue';
  if (key === 'today') return 'Today';
  if (key === 'thisWeek') return 'This Week';
  if (key === 'upcoming') return 'Upcoming';
  if (key === 'noDueDate') return 'No due date';
  return 'Other';
}

function resolveSort(sort = 'dueDate') {
  if (sort === 'priority') {
    return (a, b) => (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
  }
  if (sort === 'updatedAt') {
    return (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  }
  if (sort === 'fifo') {
    return (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }
  if (sort === 'createdAt') {
    return (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }
  return (a, b) => {
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    return da - db;
  };
}

function resolveArchiveFilter(query = {}) {
  const includeArchived = String(query.includeArchived || '').toLowerCase() === 'true';
  const onlyArchived = String(query.onlyArchived || '').toLowerCase() === 'true';
  if (onlyArchived) return { archived: true };
  if (includeArchived) return {};
  return { archived: { $ne: true } };
}

function computePausedSeconds(pausedIntervals = [], now = new Date()) {
  return (Array.isArray(pausedIntervals) ? pausedIntervals : []).reduce((sum, interval) => {
    if (!interval?.pausedAt) return sum;
    const pausedAt = new Date(interval.pausedAt);
    if (Number.isNaN(pausedAt.getTime())) return sum;
    const resumedAt = interval?.resumedAt ? new Date(interval.resumedAt) : now;
    if (Number.isNaN(resumedAt.getTime()) || resumedAt < pausedAt) return sum;
    const diff = Math.max(0, Math.floor((resumedAt.getTime() - pausedAt.getTime()) / 1000));
    return sum + diff;
  }, 0);
}

function computeElapsedSeconds(log, now = new Date()) {
  if (!log?.startTime) return 0;
  const startedAt = new Date(log.startTime);
  if (Number.isNaN(startedAt.getTime())) return 0;
  const totalSeconds = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
  const pausedSeconds = computePausedSeconds(log.pausedIntervals, now);
  return Math.max(0, totalSeconds - pausedSeconds);
}

function normalizeTask(task, projectName, personalOrder, timer = null) {
  return {
    _id: String(task._id),
    title: task.title,
    issueType: task.issueType || 'task',
    parentTaskId: task.parentTaskId ? String(task.parentTaskId) : null,
    description: task.description || '',
    priority: task.priority || 'medium',
    status: task.status || 'todo',
    dueDate: task.dueDate || null,
    updatedAt: task.updatedAt,
    projectId: String(task.projectId),
    projectName,
    points: task.points || 0,
    archived: Boolean(task.archived),
    personalOrder: personalOrder ?? null,
    timer,
  };
}

function toObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(String(id));
  } catch {
    return null;
  }
}

function assignedToUserFilter(userIdObj) {
  return {
    $or: [{ primaryAssigneeId: userIdObj }, { assigneeIds: userIdObj }],
  };
}

function getPrimaryAssignee(task) {
  if (task.primaryAssigneeId) return String(task.primaryAssigneeId);
  if (Array.isArray(task.assigneeIds) && task.assigneeIds.length) return String(task.assigneeIds[0]);
  return null;
}

async function resolveEmployeeForUser(workspaceId, userIdObj) {
  if (!workspaceId || !userIdObj) return null;
  const direct = await Employee.findOne({ workspaceId, userId: userIdObj }, { _id: 1 }).lean();
  if (direct?._id) return direct;

  const user = await User.findById(userIdObj, { displayName: 1, email: 1 }).lean();
  if (!user) return null;
  const employeeName = user.displayName || user.email || 'User';
  const byName = await Employee.findOne({ workspaceId, name: employeeName }, { _id: 1, userId: 1 }).lean();
  if (byName?._id) {
    if (!byName.userId) {
      await Employee.updateOne({ _id: byName._id, workspaceId, userId: null }, { $set: { userId: userIdObj } });
    }
    return byName;
  }
  return null;
}

function emitAssignmentEvents(io, workspaceId, taskBefore, taskAfter) {
  const beforeUser = taskBefore ? getPrimaryAssignee(taskBefore) : null;
  const afterUser = taskAfter ? getPrimaryAssignee(taskAfter) : null;

  if (beforeUser === afterUser) return;

  const payload = {
    workspaceId,
    entity: 'task',
    action: 'updated',
    data: taskAfter || taskBefore,
    meta: { version: Date.now(), at: new Date().toISOString() },
  };

  if (afterUser) {
    io.to(userRoom(afterUser)).emit('task:assignedToMe', payload);
  }
  if (beforeUser) {
    io.to(userRoom(beforeUser)).emit('task:unassigned', payload);
  }
}

export const myTasksService = {
  async list({ workspaceId, userId, query = {} }) {
    const userIdObj = toObjectId(userId);
    if (!userIdObj) {
      return { groups: [], meta: { total: 0 } };
    }

    const where = { workspaceId, ...resolveArchiveFilter(query), ...assignedToUserFilter(userIdObj) };
    if (query.projectId) {
      const projectObj = toObjectId(query.projectId);
      if (projectObj) where.projectId = projectObj;
    }
    if (query.issueType) {
      where.issueType = String(query.issueType).toLowerCase();
    }
    if (query.priority) where.priority = String(query.priority).toLowerCase();

    const now = new Date();
    const today = toDateOnly(now);
    const endWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (query.filter === 'today') {
      where.dueDate = { $gte: today, $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) };
    } else if (query.filter === 'week') {
      where.dueDate = { $gte: today, $lt: endWeek };
    } else if (query.filter === 'overdue') {
      where.dueDate = { $lt: today };
      where.status = { $nin: [...FINAL_STATUSES] };
    }

    const projection = {
      title: 1,
      issueType: 1,
      parentTaskId: 1,
      description: 1,
      priority: 1,
      status: 1,
      dueDate: 1,
      updatedAt: 1,
      projectId: 1,
      points: 1,
      archived: 1,
      primaryAssigneeId: 1,
      assigneeIds: 1,
    };

    const [tasks, projects, orders, employee] = await Promise.all([
      Task.find(where, projection).lean(),
      Project.find({ workspaceId }, { name: 1 }).lean(),
      TaskOrder.find({ workspaceId, userId: userIdObj }, { taskId: 1, order: 1, groupKey: 1 }).lean(),
      resolveEmployeeForUser(workspaceId, userIdObj),
    ]);

    const taskIds = tasks.map((task) => task._id);
    const activeLogs = employee?._id && taskIds.length
      ? await TimeLog.find(
          {
            workspaceId,
            taskId: { $in: taskIds },
            employeeId: employee._id,
            endTime: null,
            isDeleted: { $ne: true },
          },
          { taskId: 1, employeeId: 1, startTime: 1, isPaused: 1, pausedIntervals: 1 },
        ).lean()
      : [];

    const nowForTimers = new Date();
    const timerByTaskId = new Map(
      activeLogs.map((log) => [
        String(log.taskId),
        {
          active: true,
          paused: Boolean(log.isPaused),
          startedAt: log.startTime || null,
          elapsedSeconds: computeElapsedSeconds(log, nowForTimers),
          employeeId: log.employeeId ? String(log.employeeId) : null,
          logId: log._id ? String(log._id) : null,
        },
      ]),
    );

    const projectMap = new Map(projects.map((project) => [String(project._id), project.name]));
    const orderMap = new Map(orders.map((item) => [`${String(item.taskId)}:${String(item.groupKey || 'all')}`, item.order]));
    const sorter = resolveSort(query.sort);
    const groupBy = resolveGroupBy(query.groupBy);

    const normalized = tasks
      .map((task) => {
        const projectName = projectMap.get(String(task.projectId)) || 'Unknown Project';
        const base = normalizeTask(task, projectName, null, timerByTaskId.get(String(task._id)) || null);
        const groupKey = groupKeyForTask(base, groupBy);
        const personalOrder = orderMap.get(`${String(base._id)}:${groupKey}`);
        return { ...base, personalOrder };
      })
      .sort((a, b) => {
        const ao = a.personalOrder ?? Number.MAX_SAFE_INTEGER;
        const bo = b.personalOrder ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return sorter(a, b);
      });

    const groupMap = new Map();
    for (const task of normalized) {
      const key = groupKeyForTask(task, groupBy);
      if (!groupMap.has(key)) {
        groupMap.set(key, { key, label: labelForGroupKey(groupBy, key, task), items: [] });
      }
      groupMap.get(key).items.push(task);
    }

    let groups = Array.from(groupMap.values());
    if (groupBy === 'dueDate') {
      groups = DUE_DATE_ORDER.filter((key) => groupMap.has(key)).map((key) => groupMap.get(key));
    } else if (groupBy === 'status') {
      const order = STATUS_ORDER.filter((key) => groupMap.has(key)).map((key) => groupMap.get(key));
      const rest = groups.filter((group) => !STATUS_ORDER.includes(group.key)).sort((a, b) => a.label.localeCompare(b.label));
      groups = [...order, ...rest];
    } else if (groupBy === 'priority') {
      const order = PRIORITY_ORDER.filter((key) => groupMap.has(key)).map((key) => groupMap.get(key));
      const rest = groups.filter((group) => !PRIORITY_ORDER.includes(group.key)).sort((a, b) => a.label.localeCompare(b.label));
      groups = [...order, ...rest];
    } else if (groupBy === 'project') {
      groups = groups.sort((a, b) => a.label.localeCompare(b.label));
    }

    const limit = Math.min(Math.max(Number(query.limit) || 0, 0), 100);
    const items = limit ? normalized.slice(0, limit) : [];

    return {
      groups,
      items,
      meta: {
        total: normalized.length,
        view: query.view || 'list',
        filter: query.filter || 'all',
        sort: query.sort || 'dueDate',
        groupBy,
      },
    };
  },

  async patchTask({ workspaceId, userId, taskId, data, io }) {
    const userIdObj = toObjectId(userId);
    const before = await Task.findOne(
      { _id: taskId, workspaceId },
      { primaryAssigneeId: 1, assigneeIds: 1, projectId: 1, workflowId: 1, statusId: 1, status: 1 },
    ).lean();
    if (!before) return null;
    const owner = getPrimaryAssignee(before);
    if (!owner || String(owner) !== String(userIdObj)) {
      return { forbidden: true };
    }

    const updatePayload = {};
    if (data.statusId || data.status) {
      const resolvedCurrent = await workflowService.resolveTaskStatus({
        workspaceId,
        workflowId: before?.workflowId || null,
        statusId: before?.statusId || null,
        statusKey: before?.status || null,
      });
      const resolvedNext = await workflowService.resolveTaskStatus({
        workspaceId,
        workflowId: before?.workflowId || null,
        statusId: data.statusId || null,
        statusKey: data.status || null,
      });
      const isAllowed = await workflowService.validateTransition({
        workspaceId,
        workflowId: resolvedNext.workflowId || resolvedCurrent.workflowId || null,
        fromStatusId: resolvedCurrent.statusId || null,
        toStatusId: resolvedNext.statusId || null,
      });
      if (!isAllowed) {
        throw new Error('Invalid workflow transition');
      }
      if (resolvedNext.key) updatePayload.status = resolvedNext.key;
      if (resolvedNext.statusId) updatePayload.statusId = resolvedNext.statusId;
      if (resolvedNext.workflowId) updatePayload.workflowId = resolvedNext.workflowId;
    }
    if (data.priority) updatePayload.priority = String(data.priority).toLowerCase();
    if (data.dueDate !== undefined) updatePayload.dueDate = data.dueDate || null;
    if (data.storyPoints !== undefined) updatePayload.points = Number(data.storyPoints || 0);

    const updated = await Task.findOneAndUpdate(
      { _id: taskId, workspaceId },
      { $set: updatePayload },
      {
        new: true,
        projection: {
          title: 1,
          status: 1,
          statusId: 1,
          workflowId: 1,
          priority: 1,
          dueDate: 1,
          points: 1,
          projectId: 1,
          primaryAssigneeId: 1,
          assigneeIds: 1,
          updatedAt: 1,
        },
      },
    ).lean();
    if (!updated) return null;

    await appendActivity({
      workspaceId,
      module: 'myTasks',
      action: 'updated',
      entity: 'task',
      entityId: updated._id,
      payload: updated,
    });

    emitDomainEvent(io, { workspaceId, moduleName: 'tasks', entity: 'task', action: 'updated', data: updated });
    emitDomainEvent(io, { workspaceId, moduleName: 'activity', entity: 'activity', action: 'appended', data: { entity: 'task', action: 'updated' } });
    emitCoalesced(io, `dashboard:${workspaceId}`, () =>
      emitDomainEvent(io, { workspaceId, moduleName: 'dashboard', entity: 'dashboard', action: 'updated', data: { workspaceId } }),
    );
    emitAssignmentEvents(io, workspaceId, before, updated);
    await invalidateDashboardCache({ workspaceId, io, trigger: 'task:updated', userId: String(userIdObj) });

    return updated;
  },

  async quickCreate({ workspaceId, userId, data, io }) {
    const userIdObj = toObjectId(userId);
    if (!userIdObj) return null;

    let projectIdObj = toObjectId(data.projectId);
    if (!projectIdObj) {
      const firstProject = await Project.findOne({ workspaceId }, { _id: 1 }).sort({ updatedAt: -1 }).lean();
      projectIdObj = firstProject?._id || null;
    }
    if (!projectIdObj) {
      throw new Error('projectId is required');
    }

    const created = await Task.create({
      workspaceId,
      projectId: projectIdObj,
      title: String(data.title || '').trim() || 'Untitled Task',
      description: String(data.description || ''),
      issueType: 'task',
      priority: String(data.priority || 'medium').toLowerCase(),
      status: data.statusId || data.status || 'todo',
      dueDate: data.dueDate || undefined,
      assigneeIds: [userIdObj],
      primaryAssigneeId: userIdObj,
      points: Number(data.storyPoints || 0),
    });

    const task = await Task.findById(created._id, { title: 1, issueType: 1, parentTaskId: 1, status: 1, priority: 1, dueDate: 1, points: 1, projectId: 1, primaryAssigneeId: 1, assigneeIds: 1, updatedAt: 1 }).lean();

    await appendActivity({
      workspaceId,
      module: 'myTasks',
      action: 'created',
      entity: 'task',
      entityId: task._id,
      payload: task,
    });

    emitDomainEvent(io, { workspaceId, moduleName: 'tasks', entity: 'task', action: 'created', data: task });
    emitDomainEvent(io, { workspaceId, moduleName: 'activity', entity: 'activity', action: 'appended', data: { entity: 'task', action: 'created' } });
    io.to(userRoom(String(userIdObj))).emit('task:assignedToMe', {
      workspaceId,
      entity: 'task',
      action: 'assignedToMe',
      data: task,
      meta: { version: Date.now(), at: new Date().toISOString() },
    });
    emitCoalesced(io, `dashboard:${workspaceId}`, () =>
      emitDomainEvent(io, { workspaceId, moduleName: 'dashboard', entity: 'dashboard', action: 'updated', data: { workspaceId } }),
    );
    await invalidateDashboardCache({ workspaceId, io, trigger: 'task:updated', userId: String(userIdObj) });

    return task;
  },

  async reorder({ workspaceId, userId, taskId, newPosition, groupKey, io }) {
    const userIdObj = toObjectId(userId);
    if (!userIdObj) return { updated: 0 };
    const taskIdObj = toObjectId(taskId);
    if (!taskIdObj) return { updated: 0 };

    await TaskOrder.findOneAndUpdate(
      { workspaceId, userId: userIdObj, taskId: taskIdObj, groupKey: String(groupKey || 'all') },
      { $set: { order: Number(newPosition || 0) } },
      { upsert: true, new: true },
    ).lean();

    await appendActivity({
      workspaceId,
      module: 'myTasks',
      action: 'reordered',
      entity: 'task_order',
      entityId: String(userIdObj),
      payload: { count: 1 },
    });

    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'tasks',
      entity: 'task',
      action: 'updated',
      data: { _id: String(userIdObj), updatedAt: new Date().toISOString() },
    });
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'activity',
      entity: 'activity',
      action: 'appended',
      data: { entity: 'task_order', action: 'reordered' },
    });

    return { updated: 1 };
  },

  async openCount({ workspaceId, userId }) {
    const userIdObj = toObjectId(userId);
    if (!userIdObj) return 0;
    return Task.countDocuments({
      workspaceId,
      ...assignedToUserFilter(userIdObj),
      status: { $nin: [...FINAL_STATUSES] },
    });
  },
};
