import { Sprint } from '../../models/sprint.model.js';
import { Task } from '../../models/task.model.js';
import { appendActivity } from '../activity/activity.service.js';
import { emitDomainEvent } from '../../sockets/emitters.js';

const FINAL_STATUSES = ['completed', 'done', 'closed'];

function parsePage(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  return { page, limit, skip: (page - 1) * limit };
}

function priorityRank(priority) {
  const map = { critical: 0, high: 1, medium: 2, low: 3 };
  return map[String(priority || 'medium').toLowerCase()] ?? 99;
}

export const sprintsService = {
  async listByProject({ workspaceId, projectId, query = {} }) {
    const { page, limit, skip } = parsePage(query);
    const where = { workspaceId, projectId };
    if (query.status) {
      where.status = String(query.status);
    }
    const [items, total] = await Promise.all([
      Sprint.find(where, { projectId: 1, name: 1, goal: 1, startDate: 1, endDate: 1, status: 1, capacity: 1, updatedAt: 1 })
        .sort({ startDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Sprint.countDocuments(where),
    ]);
    return { items, meta: { page, limit, total } };
  },

  async create({ workspaceId, projectId, data, io }) {
    const created = await Sprint.create({
      workspaceId,
      projectId,
      name: String(data?.name || '').trim(),
      goal: String(data?.goal || ''),
      startDate: data?.startDate ? new Date(data.startDate) : new Date(),
      endDate: data?.endDate ? new Date(data.endDate) : new Date(),
      status: data?.status || 'planning',
      capacity: Number(data?.capacity || 0),
    });
    const sprint = created.toObject();
    await appendActivity({
      workspaceId,
      module: 'sprints',
      action: 'created',
      entity: 'sprint',
      entityId: sprint._id,
      payload: sprint,
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'sprints', entity: 'sprint', action: 'created', data: sprint });
    return sprint;
  },

  async start({ workspaceId, id, io }) {
    const sprint = await Sprint.findOneAndUpdate(
      { workspaceId, _id: id },
      { $set: { status: 'active' } },
      { new: true, projection: { projectId: 1, name: 1, status: 1, startDate: 1, endDate: 1, capacity: 1, updatedAt: 1 } },
    ).lean();
    if (!sprint) return null;
    await appendActivity({
      workspaceId,
      module: 'sprints',
      action: 'started',
      entity: 'sprint',
      entityId: id,
      payload: sprint,
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'sprints', entity: 'sprint', action: 'started', data: sprint });
    return sprint;
  },

  async complete({ workspaceId, id, io }) {
    const sprint = await Sprint.findOneAndUpdate(
      { workspaceId, _id: id },
      { $set: { status: 'completed' } },
      { new: true, projection: { projectId: 1, name: 1, status: 1, startDate: 1, endDate: 1, capacity: 1, updatedAt: 1 } },
    ).lean();
    if (!sprint) return null;
    await appendActivity({
      workspaceId,
      module: 'sprints',
      action: 'completed',
      entity: 'sprint',
      entityId: id,
      payload: sprint,
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'sprints', entity: 'sprint', action: 'completed', data: sprint });
    return sprint;
  },

  async board({ workspaceId, id }) {
    const sprint = await Sprint.findOne({ workspaceId, _id: id }, { projectId: 1, name: 1, status: 1 }).lean();
    if (!sprint) return null;
    const tasks = await Task.find(
      { workspaceId, sprintId: id },
      {
        title: 1,
        description: 1,
        status: 1,
        priority: 1,
        dueDate: 1,
        assigneeIds: 1,
        points: 1,
        backlogOrder: 1,
        updatedAt: 1,
      },
    )
      .sort({ status: 1, backlogOrder: 1, updatedAt: -1 })
      .lean();

    const grouped = tasks.reduce((acc, task) => {
      const key = task.status || 'todo';
      if (!acc[key]) acc[key] = [];
      acc[key].push(task);
      return acc;
    }, {});

    return {
      sprint,
      columns: Object.entries(grouped).map(([status, items]) => ({
        key: status,
        title: status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        tasks: items,
        count: items.length,
      })),
    };
  },

  async burndown({ workspaceId, id }) {
    const sprint = await Sprint.findOne({ workspaceId, _id: id }, { startDate: 1, endDate: 1 }).lean();
    if (!sprint) return null;

    const tasks = await Task.find(
      { workspaceId, sprintId: id },
      { points: 1, status: 1, updatedAt: 1 },
    ).lean();

    const total = tasks.reduce((sum, task) => sum + Number(task.points || 0), 0);
    const doneByDate = new Map();
    tasks.forEach((task) => {
      if (!FINAL_STATUSES.includes(task.status)) return;
      const key = new Date(task.updatedAt).toISOString().slice(0, 10);
      doneByDate.set(key, (doneByDate.get(key) || 0) + Number(task.points || 0));
    });

    const start = new Date(sprint.startDate);
    const end = new Date(sprint.endDate);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
    let cumulative = 0;
    const points = [];
    for (let i = 0; i < days; i += 1) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const key = day.toISOString().slice(0, 10);
      cumulative += doneByDate.get(key) || 0;
      const remaining = Math.max(0, total - cumulative);
      const ideal = Math.max(0, total - (total / Math.max(1, days - 1)) * i);
      points.push({ day: key, remaining, ideal: Math.round(ideal) });
    }
    return points;
  },

  async backlog({ workspaceId, projectId }) {
    const items = await Task.find(
      { workspaceId, projectId, sprintId: null, status: { $nin: FINAL_STATUSES }, archived: { $ne: true } },
      { title: 1, issueType: 1, parentTaskId: 1, status: 1, priority: 1, backlogOrder: 1, dueDate: 1, assigneeIds: 1, updatedAt: 1 },
    )
      .sort({ backlogOrder: 1, updatedAt: -1 })
      .lean();
    items.sort((a, b) => {
      const priorityDelta = priorityRank(a.priority) - priorityRank(b.priority);
      if (priorityDelta !== 0) return priorityDelta;
      return (a.backlogOrder ?? 0) - (b.backlogOrder ?? 0);
    });
    return items;
  },

  async listSprintItems({ workspaceId, sprintId }) {
    const items = await Task.find(
      { workspaceId, sprintId, archived: { $ne: true } },
      { title: 1, issueType: 1, parentTaskId: 1, status: 1, priority: 1, backlogOrder: 1, dueDate: 1, assigneeIds: 1, points: 1, updatedAt: 1 },
    )
      .sort({ backlogOrder: 1, updatedAt: -1 })
      .lean();
    return items;
  },

  async addSprintItem({ workspaceId, sprintId, taskId, position, io }) {
    const sprint = await Sprint.findOne({ workspaceId, _id: sprintId }, { _id: 1, projectId: 1 }).lean();
    if (!sprint) return null;
    const target = await Task.findOne({ workspaceId, _id: taskId, projectId: sprint.projectId }).lean();
    if (!target) return { task: null };

    const maxItem = await Task.findOne({ workspaceId, sprintId }, { backlogOrder: 1 }).sort({ backlogOrder: -1 }).lean();
    const safePosition = Number.isFinite(Number(position)) ? Number(position) : (Number(maxItem?.backlogOrder || 0) + 1);

    const updated = await Task.findOneAndUpdate(
      { workspaceId, _id: taskId },
      { $set: { sprintId, backlogOrder: safePosition } },
      { new: true, projection: { title: 1, sprintId: 1, status: 1, backlogOrder: 1, priority: 1, updatedAt: 1 } },
    ).lean();

    await appendActivity({
      workspaceId,
      module: 'sprints',
      action: 'task_added',
      entity: 'sprint',
      entityId: sprintId,
      payload: { taskId: String(taskId), sprintId: String(sprintId), position: safePosition },
    });
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'sprints',
      entity: 'sprint',
      action: 'updated',
      data: { sprintId: String(sprintId), taskId: String(taskId) },
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'tasks', entity: 'task', action: 'updated', data: updated });
    return { task: updated };
  },

  async reorderSprintItems({ workspaceId, sprintId, orderedTaskIds = [], io }) {
    const safeIds = Array.isArray(orderedTaskIds) ? orderedTaskIds.filter(Boolean) : [];
    if (!safeIds.length) return { updated: 0 };
    const bulk = safeIds.map((taskId, index) => ({
      updateOne: {
        filter: { workspaceId, _id: taskId, sprintId },
        update: { $set: { backlogOrder: index } },
      },
    }));
    await Task.bulkWrite(bulk);
    await appendActivity({
      workspaceId,
      module: 'sprints',
      action: 'sprint_reordered',
      entity: 'sprint',
      entityId: sprintId,
      payload: { count: safeIds.length },
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'sprints', entity: 'sprint', action: 'updated', data: { sprintId: String(sprintId) } });
    return { updated: safeIds.length };
  },

  async incompleteTasks({ workspaceId, sprintId }) {
    const items = await Task.find(
      { workspaceId, sprintId, status: { $nin: FINAL_STATUSES }, archived: { $ne: true } },
      { title: 1, status: 1, priority: 1, assigneeIds: 1, updatedAt: 1 },
    )
      .sort({ updatedAt: -1 })
      .lean();
    return items;
  },

  async setBacklogOrder({ workspaceId, taskId, backlogOrder, io }) {
    const task = await Task.findOneAndUpdate(
      { workspaceId, _id: taskId },
      { $set: { backlogOrder: Number(backlogOrder || 0) } },
      { new: true, projection: { title: 1, projectId: 1, sprintId: 1, status: 1, backlogOrder: 1, priority: 1, updatedAt: 1 } },
    ).lean();
    if (!task) return null;
    await appendActivity({
      workspaceId,
      module: 'sprints',
      action: 'backlog_order_updated',
      entity: 'task',
      entityId: taskId,
      payload: { backlogOrder: Number(backlogOrder || 0) },
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'tasks', entity: 'task', action: 'updated', data: task });
    return task;
  },

  async moveBacklogTasksToSprint({ workspaceId, sprintId, taskIds = [], io }) {
    const sprint = await Sprint.findOne({ workspaceId, _id: sprintId }, { _id: 1, projectId: 1 }).lean();
    if (!sprint) return null;
    const cleanIds = Array.isArray(taskIds) ? taskIds.filter(Boolean) : [];
    if (!cleanIds.length) {
      const error = new Error('taskIds is required');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    const existingTasks = await Task.find(
      { workspaceId, _id: { $in: cleanIds } },
      { _id: 1, projectId: 1 },
    ).lean();
    if (existingTasks.length !== cleanIds.length) {
      const error = new Error('One or more tasks were not found');
      error.code = 'NOT_FOUND';
      throw error;
    }
    const crossProjectTask = existingTasks.find((task) => String(task.projectId) !== String(sprint.projectId));
    if (crossProjectTask) {
      const error = new Error('One or more tasks do not belong to this sprint project');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    const result = await Task.updateMany(
      { workspaceId, _id: { $in: cleanIds }, projectId: sprint.projectId },
      { $set: { sprintId } },
    );
    const movedTasks = await Task.find(
      { workspaceId, _id: { $in: cleanIds } },
      { _id: 1, projectId: 1, sprintId: 1, status: 1, backlogOrder: 1, priority: 1, updatedAt: 1, title: 1 },
    ).lean();

    await appendActivity({
      workspaceId,
      module: 'sprints',
      action: 'tasks_added',
      entity: 'sprint',
      entityId: sprintId,
      payload: { taskIds: cleanIds, updated: result.modifiedCount || 0 },
    });
    for (const task of movedTasks) {
      emitDomainEvent(io, {
        workspaceId,
        moduleName: 'tasks',
        entity: 'task',
        action: 'updated',
        data: task,
      });
    }
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'sprints',
      entity: 'sprint',
      action: 'updated',
      data: {
        sprintId: String(sprintId),
        projectId: String(sprint.projectId),
        taskIds: cleanIds.map(String),
        updated: result.modifiedCount || 0,
      },
    });
    return {
      sprintId: String(sprintId),
      projectId: String(sprint.projectId),
      taskIds: cleanIds.map(String),
      updated: result.modifiedCount || 0,
    };
  },

  async completeWithAction({ workspaceId, sprintId, action, nextSprintId, io }) {
    const sprint = await Sprint.findOne({ workspaceId, _id: sprintId }, { _id: 1, projectId: 1 }).lean();
    if (!sprint) return null;

    if (action === 'move_to_sprint' && nextSprintId) {
      await Task.updateMany(
        { workspaceId, sprintId, status: { $nin: FINAL_STATUSES } },
        { $set: { sprintId: nextSprintId } },
      );
    } else {
      await Task.updateMany(
        { workspaceId, sprintId, status: { $nin: FINAL_STATUSES } },
        { $set: { sprintId: null } },
      );
    }

    const completed = await Sprint.findOneAndUpdate(
      { workspaceId, _id: sprintId },
      { $set: { status: 'completed' } },
      { new: true, projection: { projectId: 1, name: 1, status: 1, startDate: 1, endDate: 1, capacity: 1, updatedAt: 1 } },
    ).lean();

    await appendActivity({
      workspaceId,
      module: 'sprints',
      action: 'completed',
      entity: 'sprint',
      entityId: sprintId,
      payload: { sprintId: String(sprintId), action: action || 'backlog', nextSprintId: nextSprintId || null },
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'sprints', entity: 'sprint', action: 'completed', data: completed });
    return completed;
  },
};
