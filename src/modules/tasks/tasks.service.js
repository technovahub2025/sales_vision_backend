import mongoose from 'mongoose';
import { Task } from '../../models/task.model.js';
import { TaskAttachment } from '../../models/taskAttachment.model.js';
import { Employee } from '../../models/employee.model.js';
import { Contact } from '../../models/contact.model.js';
import { TimeLog } from '../../models/timeLog.model.js';
import { TaskDependency } from '../../models/taskDependency.model.js';
import { Project } from '../../models/project.model.js';
import { Activity } from '../../models/activity.model.js';
import { WorkspaceMember } from '../../models/workspaceMember.model.js';
import { User } from '../../models/user.model.js';
import { createRepository } from '../../repositories/createRepository.js';
import { appendActivity } from '../activity/activity.service.js';
import { emitDomainEvent, emitCoalesced } from '../../sockets/emitters.js';
import { invalidateDashboardCache } from '../dashboard/dashboard.service.js';
import { userRoom } from '../../sockets/rooms.js';
import { validateCustomFields } from '../customFields/customFields.service.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { workflowService } from '../workflow/workflow.service.js';
import { getPagination } from '../../utils/pagination.js';
import { planLimitsService } from '../../services/planLimits.service.js';

const repo = createRepository(Task);
const PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
const FINAL_STATUSES = new Set(['completed', 'done', 'closed']);
const SORT_FIELDS = new Set(['dueDate', 'priority', 'createdAt', 'updatedAt']);
const ISSUE_TYPES = new Set(['epic', 'task', 'subtask']);
const COMPLETED_STATUS_KEY = 'completed';

function createTaskStatusLockedError() {
  const error = new Error('Completed task cannot be moved back');
  error.code = 'TASK_STATUS_LOCKED';
  error.statusCode = 409;
  return error;
}

function emitTaskChange(io, workspaceId, task, action = 'updated') {
  emitDomainEvent(io, { workspaceId, moduleName: 'tasks', entity: 'task', action, data: task });
  emitDomainEvent(io, { workspaceId, moduleName: 'board', entity: 'board', action: 'updated', data: { projectId: task.projectId } });
  emitDomainEvent(io, { workspaceId, moduleName: 'activity', entity: 'activity', action: 'appended', data: { entity: 'task', action } });
  emitCoalesced(io, `dashboard:${workspaceId}`, () =>
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'dashboard',
      entity: 'dashboard',
      action: 'updated',
      data: { workspaceId },
    }),
  );
}

function normalizeTimeRange(from, to) {
  const where = {};
  if (from || to) {
    where.loggedAt = {};
    if (from) where.loggedAt.$gte = new Date(from);
    if (to) where.loggedAt.$lte = new Date(to);
  }
  return where;
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

function csvEscape(value) {
  const raw = value == null ? '' : String(value);
  if (!/[,"\n]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function buildTaskFilter(query = {}) {
  const filter = {};
  if (String(query.includeArchived || '').toLowerCase() !== 'true') {
    filter.archived = { $ne: true };
  }
  if (query.projectId) filter.projectId = query.projectId;
  if (query.status) filter.status = String(query.status);
  if (query.priority) filter.priority = String(query.priority).toLowerCase();
  if (query.issueType) filter.issueType = String(query.issueType).toLowerCase();
  if (query.assignee) filter.assigneeIds = query.assignee;
  if (query.sprint) filter.sprintId = query.sprint;
  if (query.epic) filter.parentTaskId = query.epic;
  if (query.label) filter.labelIds = query.label;
  if (query.dueBefore || query.dueAfter) {
    filter.dueDate = {};
    if (query.dueBefore) filter.dueDate.$lte = new Date(query.dueBefore);
    if (query.dueAfter) filter.dueDate.$gte = new Date(query.dueAfter);
  }
  if (query.search) {
    filter.$or = [
      { title: { $regex: String(query.search), $options: 'i' } },
      { description: { $regex: String(query.search), $options: 'i' } },
    ];
  }
  return filter;
}

function buildTaskSort(query = {}) {
  const sortBy = SORT_FIELDS.has(String(query.sortBy)) ? String(query.sortBy) : 'updatedAt';
  const sortOrder = String(query.sortOrder).toLowerCase() === 'asc' ? 1 : -1;
  return { [sortBy]: sortOrder, _id: -1 };
}

async function computeTaskDepth({ workspaceId, parentTaskId }) {
  if (!parentTaskId) return 0;
  let depth = 1;
  let current = await Task.findOne({ workspaceId, _id: parentTaskId }, { parentTaskId: 1 }).lean();
  while (current?.parentTaskId) {
    depth += 1;
    if (depth > 3) break;
    current = await Task.findOne({ workspaceId, _id: current.parentTaskId }, { parentTaskId: 1 }).lean();
  }
  return depth;
}

async function hasBlockingDependency({ workspaceId, taskId }) {
  const deps = await TaskDependency.find(
    { workspaceId, taskId, type: 'blocks' },
    { dependsOnTaskId: 1 },
  ).lean();
  if (!deps.length) return false;
  const depIds = deps.map((dep) => dep.dependsOnTaskId);
  const open = await Task.findOne(
    { workspaceId, _id: { $in: depIds }, status: { $nin: Array.from(FINAL_STATUSES) } },
    { _id: 1 },
  ).lean();
  return Boolean(open);
}

async function getDependencyGraph(workspaceId) {
  const rows = await TaskDependency.find(
    { workspaceId, type: 'blocks' },
    { taskId: 1, dependsOnTaskId: 1 },
  ).lean();
  /** @type {Map<string, Set<string>>} */
  const graph = new Map();
  for (const row of rows) {
    const taskId = String(row.taskId);
    const depId = String(row.dependsOnTaskId);
    if (!graph.has(taskId)) graph.set(taskId, new Set());
    graph.get(taskId).add(depId);
    if (!graph.has(depId)) graph.set(depId, new Set());
  }
  return graph;
}

function hasPath(graph, startNode, targetNode) {
  if (startNode === targetNode) return true;
  const queue = [startNode];
  const visited = new Set([startNode]);
  while (queue.length) {
    const node = queue.shift();
    const next = graph.get(node);
    if (!next) continue;
    for (const neighbor of next) {
      if (neighbor === targetNode) return true;
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return false;
}

function topologicalOrder(graph) {
  const indegree = new Map();
  for (const [node, deps] of graph.entries()) {
    if (!indegree.has(node)) indegree.set(node, 0);
    for (const dep of deps) {
      indegree.set(dep, indegree.get(dep) || 0);
      indegree.set(node, (indegree.get(node) || 0) + 1);
    }
  }
  const queue = [];
  for (const [node, degree] of indegree.entries()) {
    if (degree === 0) queue.push(node);
  }
  const order = [];
  while (queue.length) {
    const node = queue.shift();
    order.push(node);
    for (const [taskId, deps] of graph.entries()) {
      if (deps.has(node)) {
        const nextDegree = (indegree.get(taskId) || 0) - 1;
        indegree.set(taskId, nextDegree);
        if (nextDegree === 0) queue.push(taskId);
      }
    }
  }
  return order;
}

function primaryAssignee(task) {
  if (task?.primaryAssigneeId) return String(task.primaryAssigneeId);
  if (Array.isArray(task?.assigneeIds) && task.assigneeIds.length) return String(task.assigneeIds[0]);
  return null;
}

function normalizeIssueType(issueType, parentTaskId) {
  const explicit = issueType ? String(issueType).toLowerCase() : '';
  const inferred = explicit || (parentTaskId ? 'subtask' : 'task');
  if (!ISSUE_TYPES.has(inferred)) {
    throw new Error('invalid issue type');
  }
  return inferred;
}

function normalizeExternalCollaborators(externalCollaborators = []) {
  const incoming = Array.isArray(externalCollaborators) ? externalCollaborators : [];
  const seen = new Set();
  const normalized = [];
  for (const item of incoming) {
    const entityType = String(item?.entityType || '').toLowerCase();
    const entityId = String(item?.entityId || '');
    if (!entityType || !entityId) continue;
    if (entityType !== 'contact' && entityType !== 'employee') {
      throw new Error('invalid external collaborator type');
    }
    const key = `${entityType}:${entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ entityType, entityId });
  }
  return normalized;
}

async function normalizeAssignees({
  workspaceId,
  primaryAssigneeId,
  assigneeIds,
  fallbackPrimaryAssigneeId,
  fallbackAssigneeIds = [],
}) {
  const explicitPrimary = primaryAssigneeId === undefined ? undefined : (primaryAssigneeId || null);
  const baseAssignees = assigneeIds === undefined ? (Array.isArray(fallbackAssigneeIds) ? fallbackAssigneeIds : []) : assigneeIds;
  const uniqueAssignees = Array.from(new Set((Array.isArray(baseAssignees) ? baseAssignees : []).map(String).filter(Boolean)));

  let primary = explicitPrimary;
  if (primary === undefined) {
    primary = fallbackPrimaryAssigneeId ? String(fallbackPrimaryAssigneeId) : (uniqueAssignees[0] || null);
  }
  if (primary && !uniqueAssignees.includes(String(primary))) {
    uniqueAssignees.unshift(String(primary));
  }

  if (!uniqueAssignees.length) {
    return { primaryAssigneeId: primary || null, assigneeIds: [] };
  }

  const members = await WorkspaceMember.find(
    { workspaceId, status: 'active', userId: { $in: uniqueAssignees } },
    { userId: 1 },
  ).lean();
  const validMembers = new Set(members.map((member) => String(member.userId)));

  for (const memberId of uniqueAssignees) {
    if (!validMembers.has(String(memberId))) {
      throw new Error('assignee must be an active workspace member');
    }
  }
  if (primary && !validMembers.has(String(primary))) {
    throw new Error('primary assignee must be an active workspace member');
  }

  return {
    primaryAssigneeId: primary || null,
    assigneeIds: uniqueAssignees,
  };
}

async function validateExternalCollaborators({ workspaceId, externalCollaborators }) {
  const normalized = normalizeExternalCollaborators(externalCollaborators);
  if (!normalized.length) return [];

  const contactIds = normalized
    .filter((item) => item.entityType === 'contact')
    .map((item) => item.entityId);
  const employeeIds = normalized
    .filter((item) => item.entityType === 'employee')
    .map((item) => item.entityId);

  if (contactIds.length) {
    const count = await Contact.countDocuments({ workspaceId, _id: { $in: contactIds } });
    if (count !== contactIds.length) {
      throw new Error('invalid contact collaborator');
    }
  }
  if (employeeIds.length) {
    const count = await Employee.countDocuments({ workspaceId, _id: { $in: employeeIds } });
    if (count !== employeeIds.length) {
      throw new Error('invalid employee collaborator');
    }
  }
  return normalized;
}

async function resolveHierarchyAndIssueType({ workspaceId, taskId = null, issueType, parentTaskId }) {
  const normalizedParentId = parentTaskId ? String(parentTaskId) : null;
  const normalizedIssueType = normalizeIssueType(issueType, normalizedParentId);

  if (normalizedIssueType === 'epic' && normalizedParentId) {
    throw new Error('epic cannot have a parent');
  }
  if (normalizedIssueType === 'subtask' && !normalizedParentId) {
    throw new Error('subtask must have a parent task');
  }

  let parentTask = null;
  if (normalizedParentId) {
    if (taskId && String(taskId) === normalizedParentId) {
      throw new Error('task cannot be parent of itself');
    }
    parentTask = await Task.findOne(
      { workspaceId, _id: normalizedParentId },
      { _id: 1, issueType: 1, parentTaskId: 1 },
    ).lean();
    if (!parentTask) {
      throw new Error('parent task not found');
    }
    const parentIssueType = String(parentTask.issueType || 'task').toLowerCase();
    if (normalizedIssueType === 'task' && parentIssueType !== 'epic') {
      throw new Error('task parent must be an epic');
    }
    if (normalizedIssueType === 'subtask' && parentIssueType !== 'task') {
      throw new Error('subtask parent must be a task');
    }
    const depth = await computeTaskDepth({ workspaceId, parentTaskId: normalizedParentId });
    if (depth > 2) {
      throw new Error('Sub-task depth limit exceeded');
    }
  }

  return { issueType: normalizedIssueType, parentTaskId: normalizedParentId, parentTask };
}

async function emitAssignmentDelta(io, workspaceId, beforeTask, afterTask) {
  const before = primaryAssignee(beforeTask);
  const after = primaryAssignee(afterTask);
  if (before === after) return;

  const payload = {
    workspaceId,
    entity: 'task',
    action: 'updated',
    data: afterTask || beforeTask,
    meta: { version: Date.now(), at: new Date().toISOString() },
  };
  if (after) {
    io.to(userRoom(after)).emit('task:assignedToMe', payload);
    await notificationsService.create({
      workspaceId,
      io,
      data: {
        userId: after,
        type: 'task_assigned',
        title: `Task assigned: ${afterTask?.title || 'Task'}`,
        body: `You were assigned a task`,
        entityType: 'task',
        entityId: afterTask?._id || beforeTask?._id,
      },
    });
  }
  if (before) {
    io.to(userRoom(before)).emit('task:unassigned', payload);
  }
}

async function normalizeCreatePayload({ workspaceId, data }) {
  const title = String(data?.title || '').trim();
  if (!title) {
    throw new Error('title is required');
  }

  if (!data?.projectId) {
    throw new Error('projectId is required');
  }

  const project = await Project.findOne({ workspaceId, _id: data.projectId })
    .select('_id boardConfig.columns')
    .lean();
  if (!project) {
    throw new Error('project not found');
  }

  const allowedStatuses = new Set(
    (project.boardConfig?.columns || []).map((column) => column.key).filter(Boolean),
  );
  if (!allowedStatuses.size) {
    ['todo', 'in_progress', 'in_review', 'completed'].forEach((status) => allowedStatuses.add(status));
  }

  const priority = String(data?.priority || 'medium').toLowerCase();
  if (!PRIORITIES.has(priority)) {
    throw new Error('invalid priority');
  }

  const requestedStatus = data?.status && allowedStatuses.has(data.status) ? data.status : [...allowedStatuses][0];
  const resolvedStatus = await workflowService.resolveTaskStatus({
    workspaceId,
    workflowId: data?.workflowId || null,
    statusId: data?.statusId || null,
    statusKey: requestedStatus,
  });
  const status = resolvedStatus.key || requestedStatus;
  const assigneeIds = Array.isArray(data?.assigneeIds) ? data.assigneeIds.filter(Boolean) : [];
  const primaryAssigneeId = data?.primaryAssigneeId || assigneeIds[0] || undefined;

  const maxPosition = await Task.findOne({ workspaceId, projectId: data.projectId, status })
    .sort({ position: -1 })
    .select({ position: 1 })
    .lean();

  return {
    projectId: data.projectId,
    workflowId: resolvedStatus.workflowId || null,
    statusId: resolvedStatus.statusId || null,
    title,
    description: String(data?.description || ''),
    priority,
    status,
    dueDate: data?.dueDate || undefined,
    points: Number(data?.points || 0),
    estimateHours: Number(data?.estimateHours || 0),
    tags: Array.isArray(data?.tags) ? data.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
    assigneeIds,
    primaryAssigneeId,
    issueType: data?.issueType || 'task',
    externalCollaborators: [],
    clientRequestId: data?.clientRequestId ? String(data.clientRequestId) : undefined,
    position: Number(maxPosition?.position ?? -1) + 1,
  };
}

async function resolveTimerEmployee({ workspaceId, employeeId, userId, createIfMissing = true }) {
  if (employeeId) {
    const direct = await Employee.findOne({ workspaceId, _id: employeeId }, { _id: 1, name: 1, userId: 1 }).lean();
    if (direct) return direct;
  }

  const userIdObj = toObjectId(userId);
  const user = userIdObj ? await User.findById(userIdObj, { displayName: 1, email: 1, avatarUrl: 1 }).lean() : null;
  if (!userIdObj || !user) {
    throw new Error('Invalid user identity for timer');
  }

  if (userIdObj) {
    const byUser = await Employee.findOne({ workspaceId, userId: userIdObj }, { _id: 1, name: 1, userId: 1 }).lean();
    if (byUser) return byUser;
  }

  const fallbackName = user.displayName || user.email || 'User';
  if (fallbackName) {
    const byName = await Employee.findOne({ workspaceId, name: fallbackName }, { _id: 1, name: 1, userId: 1 }).lean();
    if (byName) {
      if (!byName.userId && userIdObj) {
        await Employee.updateOne({ _id: byName._id, workspaceId, userId: null }, { $set: { userId: userIdObj } });
      }
      return byName;
    }
  }

  if (!createIfMissing) return null;

  const newEmployee = await Employee.create({
    workspaceId,
    userId: userIdObj || null,
    name: fallbackName,
    role: '',
    department: '',
    designation: '',
    skills: [],
    phone: '',
    bio: '',
    avatar: '',
    avatarUrl: user.avatarUrl || '',
    capacity: { hoursPerWeek: 40 },
    availability: { status: 'available' },
    joinedAt: new Date(),
    employeeCode: '',
    manager: { id: null, name: '' },
    teamIds: [],
    team: 'General',
    velocity: 0,
    status: 'active',
    task: '',
  });

  return newEmployee.toObject();
}

export const tasksService = {
  async list({ workspaceId, query = {} }) {
    const { page, limit, skip } = getPagination(query);
    const filter = { workspaceId, ...buildTaskFilter(query) };
    const sort = buildTaskSort(query);
    const projection = {
      title: 1,
      description: 1,
      projectId: 1,
      workflowId: 1,
      statusId: 1,
      parentTaskId: 1,
      issueType: 1,
      sprintId: 1,
      priority: 1,
      status: 1,
      position: 1,
      dueDate: 1,
      points: 1,
      estimateHours: 1,
      assigneeIds: 1,
      primaryAssigneeId: 1,
      externalCollaborators: 1,
      tags: 1,
      labelIds: 1,
      backlogOrder: 1,
      totalTimeLogged: 1,
      createdAt: 1,
      updatedAt: 1,
    };

    const [items, total] = await Promise.all([
      Task.find(filter, projection).sort(sort).skip(skip).limit(limit).lean(),
      Task.countDocuments(filter),
    ]);
    return { items, meta: { page, limit, total } };
  },
  async getById({ workspaceId, id }) {
    const task = await Task.findOne({ workspaceId, _id: id }).lean();
    if (!task) return null;
    const [children, dependencies] = await Promise.all([
      Task.find(
        { workspaceId, parentTaskId: id },
        { title: 1, status: 1, priority: 1, dueDate: 1, points: 1, updatedAt: 1 },
      )
        .sort({ updatedAt: -1 })
        .lean(),
      TaskDependency.find(
        { workspaceId, taskId: id },
        { taskId: 1, dependsOnTaskId: 1, type: 1, updatedAt: 1 },
      ).lean(),
    ]);
    const totalChildren = children.length;
    const completedChildren = children.filter((item) => FINAL_STATUSES.has(String(item.status || ''))).length;
    const childProgress = totalChildren ? Math.round((completedChildren / totalChildren) * 100) : 0;
    return { ...task, children, dependencies, childProgress };
  },

  async create({ workspaceId, data, io }) {
    if (data?.customFields) {
      const validation = await validateCustomFields('task', data.customFields, workspaceId);
      if (!validation.valid) throw new Error(validation.message);
    }
    const hierarchy = await resolveHierarchyAndIssueType({
      workspaceId,
      issueType: data?.issueType,
      parentTaskId: data?.parentTaskId || null,
    });
    const normalized = await normalizeCreatePayload({ workspaceId, data });
    normalized.issueType = hierarchy.issueType;
    normalized.parentTaskId = hierarchy.parentTaskId;
    normalized.sprintId = data?.sprintId || null;
    normalized.backlogOrder = Number(data?.backlogOrder || 0);
    normalized.labelIds = Array.isArray(data?.labelIds) ? data.labelIds : [];
    normalized.customFields = data?.customFields && typeof data.customFields === 'object' ? data.customFields : {};
    normalized.approval = {
      required: Boolean(data?.approval?.required),
      approvedBy: data?.approval?.approvedBy || null,
      approvedAt: data?.approval?.approvedAt || null,
      status: data?.approval?.status || 'pending',
    };
    const normalizedAssignees = await normalizeAssignees({
      workspaceId,
      primaryAssigneeId: normalized.primaryAssigneeId,
      assigneeIds: normalized.assigneeIds,
      fallbackPrimaryAssigneeId: null,
      fallbackAssigneeIds: [],
    });
    normalized.primaryAssigneeId = normalizedAssignees.primaryAssigneeId;
    normalized.assigneeIds = normalizedAssignees.assigneeIds;
    normalized.externalCollaborators = await validateExternalCollaborators({
      workspaceId,
      externalCollaborators: data?.externalCollaborators || [],
    });

    if (normalized.clientRequestId) {
      const existing = await Task.findOne({ workspaceId, clientRequestId: normalized.clientRequestId }).lean();
      if (existing) {
        return existing;
      }
    }

    const task = await repo.create({ workspaceId, data: normalized });
    await appendActivity({ workspaceId, module: 'tasks', action: 'created', entity: 'task', entityId: task._id, payload: task });
    emitTaskChange(io, workspaceId, task, 'created');
    await emitAssignmentDelta(io, workspaceId, null, task);
    await invalidateDashboardCache({ workspaceId, io, trigger: 'task:updated' });
    return task;
  },

  async update({ workspaceId, id, data, io }) {
    const previous = await Task.findOne({ workspaceId, _id: id }).lean();
    if (!previous) return null;
    const payload = { ...data };
    if (payload.priority && !PRIORITIES.has(String(payload.priority).toLowerCase())) {
      throw new Error('invalid priority');
    }
    if (payload.priority) {
      payload.priority = String(payload.priority).toLowerCase();
    }
    if (payload.customFields) {
      const validation = await validateCustomFields('task', payload.customFields, workspaceId);
      if (!validation.valid) throw new Error(validation.message);
    }
    if (payload.issueType !== undefined || payload.parentTaskId !== undefined) {
      const hierarchy = await resolveHierarchyAndIssueType({
        workspaceId,
        taskId: id,
        issueType: payload.issueType ?? previous.issueType,
        parentTaskId: payload.parentTaskId === undefined ? previous.parentTaskId : payload.parentTaskId,
      });
      payload.issueType = hierarchy.issueType;
      payload.parentTaskId = hierarchy.parentTaskId;
    }
    if (payload.assigneeIds !== undefined || payload.primaryAssigneeId !== undefined) {
      const normalizedAssignees = await normalizeAssignees({
        workspaceId,
        primaryAssigneeId: payload.primaryAssigneeId,
        assigneeIds: payload.assigneeIds,
        fallbackPrimaryAssigneeId: previous.primaryAssigneeId,
        fallbackAssigneeIds: previous.assigneeIds || [],
      });
      payload.primaryAssigneeId = normalizedAssignees.primaryAssigneeId;
      payload.assigneeIds = normalizedAssignees.assigneeIds;
    }
    if (payload.externalCollaborators !== undefined) {
      payload.externalCollaborators = await validateExternalCollaborators({
        workspaceId,
        externalCollaborators: payload.externalCollaborators,
      });
    }
    const transitionRequested = Boolean(payload.status || payload.statusId);
    if (transitionRequested) {
      const resolvedCurrent = await workflowService.resolveTaskStatus({
        workspaceId,
        workflowId: previous?.workflowId || payload.workflowId || null,
        statusId: previous?.statusId || null,
        statusKey: previous?.status || null,
      });
      const resolvedNext = await workflowService.resolveTaskStatus({
        workspaceId,
        workflowId: payload.workflowId || previous?.workflowId || null,
        statusId: payload.statusId || null,
        statusKey: payload.status || null,
      });
      const nextStatusKey = resolvedNext.key || payload.status || previous?.status;

      if (
        String(previous?.status || '').toLowerCase() === COMPLETED_STATUS_KEY &&
        !FINAL_STATUSES.has(String(nextStatusKey || '').toLowerCase())
      ) {
        throw createTaskStatusLockedError();
      }

      const isAllowed = await workflowService.validateTransition({
        workspaceId,
        workflowId: resolvedNext.workflowId || resolvedCurrent.workflowId || null,
        fromStatusId: resolvedCurrent.statusId || null,
        toStatusId: resolvedNext.statusId || null,
      });
      if (!isAllowed) {
        throw new Error('Invalid workflow transition');
      }

      if (nextStatusKey && FINAL_STATUSES.has(String(nextStatusKey))) {
        if (previous?.approval?.required && previous?.approval?.status !== 'approved') {
          throw new Error('Approval pending');
        }
        const blocked = await hasBlockingDependency({ workspaceId, taskId: id });
        if (blocked) {
          throw new Error('Blocked by open dependencies');
        }
      }

      payload.status = nextStatusKey;
      if (resolvedNext.workflowId) payload.workflowId = resolvedNext.workflowId;
      if (resolvedNext.statusId) payload.statusId = resolvedNext.statusId;
    }
    const task = await repo.update({ workspaceId, id, data: payload });
    if (!task) return null;
    await appendActivity({ workspaceId, module: 'tasks', action: 'updated', entity: 'task', entityId: task._id, payload: task });
    emitTaskChange(io, workspaceId, task, 'updated');
    await emitAssignmentDelta(io, workspaceId, previous, task);
    if (previous && previous.status !== task.status) {
      emitDomainEvent(io, { workspaceId, moduleName: 'tasks', entity: 'task', action: 'moved', data: task });
    }
    await invalidateDashboardCache({ workspaceId, io, trigger: 'task:updated' });
    return task;
  },

  async bulkUpdate({ workspaceId, taskIds = [], updates = {}, action, io }) {
    const uniqueIds = Array.from(new Set((Array.isArray(taskIds) ? taskIds : []).map(String))).filter(Boolean);
    if (!uniqueIds.length) return { updated: 0, deleted: 0, failed: [] };

    const result = { updated: 0, deleted: 0, failed: [] };
    if (action === 'delete') {
      for (const id of uniqueIds) {
        try {
          const removed = await this.remove({ workspaceId, id, io });
          if (!removed) {
            result.failed.push({ id, reason: 'Task not found' });
          } else {
            result.deleted += 1;
          }
        } catch (error) {
          result.failed.push({ id, reason: String(error?.message || 'Failed to delete') });
        }
      }
      return result;
    }

    if (!updates || typeof updates !== 'object' || !Object.keys(updates).length) {
      return result;
    }

    for (const id of uniqueIds) {
      try {
        const updated = await this.update({ workspaceId, id, data: updates, io });
        if (!updated) {
          result.failed.push({ id, reason: 'Task not found' });
        } else {
          result.updated += 1;
        }
      } catch (error) {
        result.failed.push({ id, reason: String(error?.message || 'Failed to update') });
      }
    }

    return result;
  },

  async duplicate({ workspaceId, id, io }) {
    const sourceTask = await Task.findOne({ workspaceId, _id: id }).lean();
    if (!sourceTask) return null;

    const sourceChildren = await Task.find(
      { workspaceId, parentTaskId: sourceTask._id },
      {
        title: 1,
        description: 1,
        issueType: 1,
        priority: 1,
        status: 1,
        points: 1,
        estimateHours: 1,
        tags: 1,
        labelIds: 1,
        externalCollaborators: 1,
        customFields: 1,
      },
    )
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();

    const createPayload = {
      projectId: sourceTask.projectId,
      workflowId: sourceTask.workflowId || null,
      statusId: sourceTask.statusId || null,
      title: `${sourceTask.title} (copy)`,
      description: sourceTask.description || '',
      priority: sourceTask.priority || 'medium',
      status: sourceTask.status || 'todo',
      points: Number(sourceTask.points || 0),
      estimateHours: Number(sourceTask.estimateHours || 0),
      tags: Array.isArray(sourceTask.tags) ? sourceTask.tags : [],
      labelIds: Array.isArray(sourceTask.labelIds) ? sourceTask.labelIds : [],
      customFields: sourceTask.customFields || {},
      issueType: sourceTask.issueType || 'task',
      externalCollaborators: Array.isArray(sourceTask.externalCollaborators) ? sourceTask.externalCollaborators : [],
      assigneeIds: [],
      primaryAssigneeId: null,
      dueDate: null,
      sprintId: null,
      parentTaskId: null,
      approval: sourceTask.approval || { required: false, status: 'pending' },
    };
    const duplicated = await this.create({ workspaceId, data: createPayload, io });
    const createdChildren = [];

    for (const child of sourceChildren) {
      const childPayload = {
        projectId: sourceTask.projectId,
        title: child.title || 'Sub-task',
        description: child.description || '',
        priority: child.priority || 'medium',
        status: child.status || 'todo',
        points: Number(child.points || 0),
        estimateHours: Number(child.estimateHours || 0),
        tags: Array.isArray(child.tags) ? child.tags : [],
        labelIds: Array.isArray(child.labelIds) ? child.labelIds : [],
        customFields: child.customFields || {},
        issueType: child.issueType || 'subtask',
        externalCollaborators: Array.isArray(child.externalCollaborators) ? child.externalCollaborators : [],
        assigneeIds: [],
        primaryAssigneeId: null,
        dueDate: null,
        sprintId: null,
        parentTaskId: duplicated._id,
      };
      const newChild = await this.create({ workspaceId, data: childPayload, io });
      createdChildren.push(newChild);
    }

    return { ...duplicated, duplicatedChildrenCount: createdChildren.length };
  },

  async getActivity({ workspaceId, taskId, query = {} }) {
    const { page, limit, skip } = getPagination(query);
    const filter = {
      workspaceId,
      entity: { $in: ['task', 'task_dependency', 'task_attachment', 'time_log'] },
      $or: [
        { entityId: String(taskId) },
        { 'payload.taskId': String(taskId) },
      ],
    };
    const [items, total] = await Promise.all([
      Activity.find(
        filter,
        { module: 1, action: 1, entity: 1, entityId: 1, payload: 1, occurredAt: 1 },
      )
        .sort({ occurredAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Activity.countDocuments(filter),
    ]);

    const mapped = items.map((item) => ({
      field: item.action,
      oldValue: null,
      newValue: item.payload || {},
      changedBy: 'workspace-actor',
      timestamp: item.occurredAt,
      module: item.module,
      entity: item.entity,
      entityId: item.entityId,
    }));
    return { items: mapped, meta: { page, limit, total } };
  },

  async setEstimate({ workspaceId, taskId, minutes, io }) {
    const hours = Math.max(0, Number(minutes || 0)) / 60;
    const task = await Task.findOneAndUpdate(
      { workspaceId, _id: taskId },
      { $set: { estimateHours: hours } },
      { returnDocument: 'after', projection: { title: 1, estimateHours: 1, projectId: 1, updatedAt: 1 } },
    ).lean();
    if (!task) return null;
    await appendActivity({
      workspaceId,
      module: 'tasks',
      action: 'estimate_updated',
      entity: 'task',
      entityId: taskId,
      payload: { minutes: Math.max(0, Number(minutes || 0)) },
    });
    emitTaskChange(io, workspaceId, task, 'updated');
    return task;
  },

  async exportCsv({ workspaceId, query = {}, write }) {
    const filter = { workspaceId, ...buildTaskFilter(query) };
    const sort = buildTaskSort(query);
    const limit = Math.min(Math.max(Number(query.limit) || 500, 1), 2000);
    let skip = 0;

    write('id,title,issueType,status,priority,projectId,assigneeIds,dueDate,createdAt,updatedAt\n');
    while (true) {
      const rows = await Task.find(
        filter,
        { title: 1, issueType: 1, status: 1, priority: 1, projectId: 1, assigneeIds: 1, dueDate: 1, createdAt: 1, updatedAt: 1 },
      )
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();
      if (!rows.length) break;

      for (const row of rows) {
        write(
          [
            csvEscape(row._id),
            csvEscape(row.title),
            csvEscape(row.issueType || 'task'),
            csvEscape(row.status),
            csvEscape(row.priority),
            csvEscape(row.projectId),
            csvEscape((row.assigneeIds || []).map(String).join('|')),
            csvEscape(row.dueDate ? new Date(row.dueDate).toISOString() : ''),
            csvEscape(row.createdAt ? new Date(row.createdAt).toISOString() : ''),
            csvEscape(row.updatedAt ? new Date(row.updatedAt).toISOString() : ''),
          ].join(',') + '\n',
        );
      }

      if (rows.length < limit) break;
      skip += rows.length;
    }
  },

  async remove({ workspaceId, id, io }) {
    const task = await repo.remove({ workspaceId, id });
    if (!task) return null;
    await appendActivity({ workspaceId, module: 'tasks', action: 'deleted', entity: 'task', entityId: task._id, payload: task });
    emitTaskChange(io, workspaceId, task, 'deleted');
    await emitAssignmentDelta(io, workspaceId, task, null);
    await invalidateDashboardCache({ workspaceId, io, trigger: 'task:updated' });
    return task;
  },

  async listAttachments({ workspaceId, taskId }) {
    const items = await TaskAttachment.find({ workspaceId, taskId })
      .select('taskId fileName mimeType size label referenceKey createdAt')
      .sort({ createdAt: -1 })
      .lean();
    return { items, meta: { total: items.length } };
  },

  async createAttachment({ workspaceId, taskId, data, io }) {
    const task = await Task.findOne({ workspaceId, _id: taskId }).select('_id projectId').lean();
    if (!task) return null;

    const fileName = String(data?.fileName || '').trim();
    const mimeType = String(data?.mimeType || '').trim();
    const size = Number(data?.size || 0);
    if (!fileName || !mimeType || size < 0) {
      throw new Error('invalid attachment payload');
    }
    const storageCheck = await planLimitsService.ensureStorageCapacity(workspaceId, size);
    if (!storageCheck.allowed) {
      const error = new Error(storageCheck.message);
      error.statusCode = 429;
      error.code = storageCheck.code;
      error.details = storageCheck.details;
      throw error;
    }

    const attachment = await TaskAttachment.create({
      workspaceId,
      taskId,
      fileName,
      mimeType,
      size,
      label: data?.label ? String(data.label) : '',
      referenceKey: data?.referenceKey ? String(data.referenceKey) : '',
    });
    const payload = attachment.toObject();

    await appendActivity({
      workspaceId,
      module: 'tasks',
      action: 'attachment_created',
      entity: 'task_attachment',
      entityId: attachment._id,
      payload,
    });

    emitDomainEvent(io, { workspaceId, moduleName: 'tasks', entity: 'task_attachment', action: 'created', data: payload });
    emitDomainEvent(io, { workspaceId, moduleName: 'board', entity: 'board', action: 'updated', data: { projectId: task.projectId } });
    emitDomainEvent(io, { workspaceId, moduleName: 'activity', entity: 'activity', action: 'appended', data: { entity: 'task_attachment', action: 'created' } });
    emitCoalesced(io, `dashboard:${workspaceId}`, () =>
      emitDomainEvent(io, {
        workspaceId,
        moduleName: 'dashboard',
        entity: 'dashboard',
        action: 'updated',
        data: { workspaceId },
      }),
    );

    return payload;
  },

  async startTimer({ workspaceId, taskId, employeeId, userId, description, io }) {
    const [task, employee] = await Promise.all([
      Task.findOne({ workspaceId, _id: taskId }, { _id: 1, projectId: 1 }).lean(),
      resolveTimerEmployee({ workspaceId, employeeId, userId, createIfMissing: true }),
    ]);

    if (!task) throw new Error('Task not found');
    if (!employee) throw new Error('Employee not found');

    const existing = await TimeLog.findOne(
      { workspaceId, taskId, employeeId: employee._id, endTime: null, isDeleted: { $ne: true } },
      { _id: 1 },
    ).lean();
    if (existing) throw new Error('Timer already running');

    const created = await TimeLog.create({
      workspaceId,
      taskId,
      employeeId: employee._id,
      description: String(description || ''),
      startTime: new Date(),
      endTime: null,
      durationMins: 0,
      loggedAt: new Date(),
      isManual: false,
    });
    const timer = created.toObject();

    await appendActivity({
      workspaceId,
      module: 'timeLogs',
      action: 'timer_started',
      entity: 'time_log',
      entityId: timer._id,
      payload: { taskId: String(taskId), employeeId: String(employee._id) },
    });
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'tasks',
      entity: 'timer',
      action: 'started',
      data: { ...timer, userId: userId ? String(userId) : null },
    });
    return timer;
  },

  async stopTimer({ workspaceId, taskId, employeeId, userId, io }) {
    const employee = await resolveTimerEmployee({ workspaceId, employeeId, userId, createIfMissing: false });
    if (!employee) throw new Error('Employee not found');

    const log = await TimeLog.findOne(
      { workspaceId, taskId, employeeId: employee._id, endTime: null, isDeleted: { $ne: true } },
      { _id: 1, taskId: 1, employeeId: 1, startTime: 1, pausedIntervals: 1, description: 1, isManual: 1, loggedAt: 1 },
    ).lean();
    if (!log) throw new Error('No active timer found');

    const endTime = new Date();
    const totalDurationMs = endTime.getTime() - new Date(log.startTime).getTime();
    
    // Subtract paused intervals from total duration
    const totalPausedMins = (log.pausedIntervals || []).reduce((sum, interval) => {
      return sum + (interval.durationMins || 0);
    }, 0);
    
    const durationMins = Math.max(1, Math.round(totalDurationMs / 60000) - totalPausedMins);
    
    const updated = await TimeLog.findOneAndUpdate(
      { _id: log._id, workspaceId },
      { $set: { endTime, durationMins, isPaused: false } },
      { returnDocument: 'after', projection: { taskId: 1, employeeId: 1, startTime: 1, endTime: 1, durationMins: 1, description: 1, isManual: 1, loggedAt: 1, isPaused: 1, pausedIntervals: 1 } },
    ).lean();

    await Task.updateOne({ workspaceId, _id: taskId }, { $inc: { totalTimeLogged: durationMins } });

    await appendActivity({
      workspaceId,
      module: 'timeLogs',
      action: 'timer_stopped',
      entity: 'time_log',
      entityId: updated._id,
      payload: { taskId: String(taskId), employeeId: String(employee._id), durationMins },
    });
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'tasks',
      entity: 'timer',
      action: 'stopped',
      data: { ...updated, userId: userId ? String(userId) : null },
    });
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'timeLogs',
      entity: 'timeLog',
      action: 'created',
      data: { ...updated, userId: userId ? String(userId) : null },
    });
    await invalidateDashboardCache({ workspaceId, io, trigger: 'timeLog:created' });
    return updated;
  },

  async pauseTimer({ workspaceId, taskId, employeeId, userId, io }) {
    const employee = await resolveTimerEmployee({ workspaceId, employeeId, userId, createIfMissing: false });
    if (!employee) throw new Error('Employee not found');

    const log = await TimeLog.findOne(
      { workspaceId, taskId, employeeId: employee._id, endTime: null, isDeleted: { $ne: true }, isPaused: false },
      { _id: 1, taskId: 1, employeeId: 1, startTime: 1, pausedIntervals: 1 }
    ).lean();
    if (!log) throw new Error('No active timer found to pause');

    const pausedAt = new Date();
    const updated = await TimeLog.findOneAndUpdate(
      { _id: log._id, workspaceId },
      {
        $set: { isPaused: true },
        $push: { pausedIntervals: { pausedAt } }
      },
      { returnDocument: 'after', projection: { taskId: 1, employeeId: 1, startTime: 1, isPaused: 1, pausedIntervals: 1 } }
    ).lean();

    await appendActivity({
      workspaceId,
      module: 'timeLogs',
      action: 'timer_paused',
      entity: 'time_log',
      entityId: updated._id,
      payload: { taskId: String(taskId), employeeId: String(employee._id), pausedAt },
    });
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'tasks',
      entity: 'timer',
      action: 'paused',
      data: { ...updated, userId: userId ? String(userId) : null },
    });
    return updated;
  },

  async resumeTimer({ workspaceId, taskId, employeeId, userId, io }) {
    const employee = await resolveTimerEmployee({ workspaceId, employeeId, userId, createIfMissing: false });
    if (!employee) throw new Error('Employee not found');

    const log = await TimeLog.findOne(
      { workspaceId, taskId, employeeId: employee._id, endTime: null, isDeleted: { $ne: true }, isPaused: true },
      { _id: 1, taskId: 1, employeeId: 1, startTime: 1, pausedIntervals: 1 }
    ).lean();
    if (!log) throw new Error('No paused timer found to resume');

    const lastInterval = log.pausedIntervals[log.pausedIntervals.length - 1];
    if (!lastInterval || !lastInterval.pausedAt) throw new Error('Invalid pause state');

    const resumedAt = new Date();
    const pauseDurationMins = Math.max(0, Math.round((resumedAt.getTime() - new Date(lastInterval.pausedAt).getTime()) / 60000));

    const updated = await TimeLog.findOneAndUpdate(
      { _id: log._id, workspaceId, 'pausedIntervals.pausedAt': lastInterval.pausedAt },
      {
        $set: { isPaused: false, 'pausedIntervals.$.resumedAt': resumedAt, 'pausedIntervals.$.durationMins': pauseDurationMins }
      },
      { returnDocument: 'after', projection: { taskId: 1, employeeId: 1, startTime: 1, isPaused: 1, pausedIntervals: 1 } }
    ).lean();

    await appendActivity({
      workspaceId,
      module: 'timeLogs',
      action: 'timer_resumed',
      entity: 'time_log',
      entityId: updated._id,
      payload: { taskId: String(taskId), employeeId: String(employee._id), resumedAt, pauseDurationMins },
    });
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'tasks',
      entity: 'timer',
      action: 'resumed',
      data: { ...updated, userId: userId ? String(userId) : null },
    });
    return updated;
  },

  async createManualTimeLog({ workspaceId, taskId, employeeId, userId, startTime, endTime, description, io }) {
    const [task, employee] = await Promise.all([
      Task.findOne({ workspaceId, _id: taskId }, { _id: 1 }).lean(),
      resolveTimerEmployee({ workspaceId, employeeId, userId, createIfMissing: true }),
    ]);

    if (!task) throw new Error('Task not found');
    if (!employee) throw new Error('Employee not found');

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new Error('Invalid time range');
    }
    const durationMins = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));

    const created = await TimeLog.create({
      workspaceId,
      taskId,
      employeeId: employee._id,
      description: String(description || ''),
      startTime: start,
      endTime: end,
      durationMins,
      loggedAt: end,
      isManual: true,
    });
    const log = created.toObject();
    await Task.updateOne({ workspaceId, _id: taskId }, { $inc: { totalTimeLogged: durationMins } });

    await appendActivity({
      workspaceId,
      module: 'timeLogs',
      action: 'created',
      entity: 'time_log',
      entityId: log._id,
      payload: { taskId: String(taskId), employeeId: String(employee._id), durationMins, isManual: true },
    });
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'timeLogs',
      entity: 'timeLog',
      action: 'created',
      data: { ...log, userId: userId ? String(userId) : null },
    });
    await invalidateDashboardCache({ workspaceId, io, trigger: 'timeLog:created' });
    return log;
  },

  async listTimeLogsByTask({ workspaceId, taskId, userId = null }) {
    let employeeFilter = null;
    if (userId) {
      const employee = await resolveTimerEmployee({ workspaceId, employeeId: null, userId, createIfMissing: false });
      if (!employee?._id) {
        return { summary: { totalMins: 0, count: 0 }, items: [] };
      }
      employeeFilter = employee._id;
    }

    const rows = await TimeLog.find(
      { workspaceId, taskId, isDeleted: { $ne: true }, ...(employeeFilter ? { employeeId: employeeFilter } : {}) },
      { employeeId: 1, description: 1, startTime: 1, endTime: 1, durationMins: 1, loggedAt: 1, isManual: 1, isPaused: 1, pausedIntervals: 1, isDeleted: 1 },
    )
      .sort({ loggedAt: -1 })
      .lean();

    return {
      summary: {
        totalMins: rows.reduce((sum, row) => sum + Number(row.durationMins || 0), 0),
        count: rows.length,
      },
      items: rows,
    };
  },

  async listTimeLogsByEmployee({ workspaceId, employeeId, query = {} }) {
    const rangeFilter = normalizeTimeRange(query.from, query.to);
    const baseWhere = { workspaceId, employeeId, isDeleted: { $ne: true }, ...rangeFilter };

    let projectTaskIds = null;
    if (query.projectId) {
      const taskRows = await Task.find({ workspaceId, projectId: query.projectId }, { _id: 1 }).lean();
      projectTaskIds = taskRows.map((row) => row._id);
      baseWhere.taskId = { $in: projectTaskIds };
    }

    const rows = await TimeLog.find(
      baseWhere,
      { taskId: 1, description: 1, startTime: 1, endTime: 1, durationMins: 1, loggedAt: 1, isManual: 1 },
    )
      .sort({ loggedAt: -1 })
      .lean();

    return {
      summary: {
        totalMins: rows.reduce((sum, row) => sum + Number(row.durationMins || 0), 0),
        count: rows.length,
        projectScoped: Boolean(query.projectId),
      },
      items: rows,
    };
  },

  async listTimeLogsByProject({ workspaceId, projectId, query = {} }) {
    const taskRows = await Task.find({ workspaceId, projectId }, { _id: 1, title: 1 }).lean();
    const taskIds = taskRows.map((row) => row._id);
    const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
    const where = {
      workspaceId: workspaceObjectId,
      taskId: { $in: taskIds },
      isDeleted: { $ne: true },
      ...normalizeTimeRange(query.from, query.to),
    };

    const rows = await TimeLog.aggregate([
      { $match: where },
      {
        $group: {
          _id: '$employeeId',
          totalMins: { $sum: '$durationMins' },
          entries: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'sv_employees',
          localField: '_id',
          foreignField: '_id',
          pipeline: [{ $project: { _id: 1, name: 1, avatar: 1, avatarUrl: 1 } }],
          as: 'employee',
        },
      },
      {
        $project: {
          _id: 0,
          employeeId: '$_id',
          totalMins: 1,
          entries: 1,
          name: { $ifNull: [{ $first: '$employee.name' }, 'Unknown'] },
          avatar: { $ifNull: [{ $first: '$employee.avatar' }, { $first: '$employee.avatarUrl' }] },
        },
      },
      { $sort: { totalMins: -1 } },
    ]);

    return {
      items: rows,
      meta: {
        taskCount: taskRows.length,
      },
    };
  },

  async dependencies({ workspaceId, taskId }) {
    const items = await TaskDependency.find(
      { workspaceId, taskId },
      { taskId: 1, dependsOnTaskId: 1, type: 1, updatedAt: 1 },
    )
      .sort({ updatedAt: -1 })
      .lean();

    const graph = await getDependencyGraph(workspaceId);
    const order = topologicalOrder(graph);
    return { items, topologicalOrder: order };
  },

  async addDependency({ workspaceId, taskId, data, io }) {
    if (!data?.dependsOnTaskId) {
      throw new Error('dependsOnTaskId is required');
    }
    if (String(taskId) === String(data.dependsOnTaskId)) {
      throw new Error('Circular dependency detected');
    }

    const graph = await getDependencyGraph(workspaceId);
    const from = String(taskId);
    const to = String(data.dependsOnTaskId);
    if (!graph.has(from)) graph.set(from, new Set());
    if (!graph.has(to)) graph.set(to, new Set());
    if (hasPath(graph, to, from)) {
      throw new Error('Circular dependency detected');
    }

    const created = await TaskDependency.create({
      workspaceId,
      taskId,
      dependsOnTaskId: data.dependsOnTaskId,
      type: data.type || 'blocks',
    });
    const item = created.toObject();
    await appendActivity({
      workspaceId,
      module: 'tasks',
      action: 'dependency_created',
      entity: 'task_dependency',
      entityId: item._id,
      payload: item,
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'tasks', entity: 'task_dependency', action: 'created', data: item });
    const nextGraph = await getDependencyGraph(workspaceId);
    return { ...item, topologicalOrder: topologicalOrder(nextGraph) };
  },

  async removeDependency({ workspaceId, id, io }) {
    const item = await TaskDependency.findOneAndDelete({ workspaceId, _id: id }, { taskId: 1, dependsOnTaskId: 1, type: 1 }).lean();
    if (!item) return null;
    await appendActivity({
      workspaceId,
      module: 'tasks',
      action: 'dependency_deleted',
      entity: 'task_dependency',
      entityId: id,
      payload: item,
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'tasks', entity: 'task_dependency', action: 'deleted', data: item });
    return item;
  },

  async approve({ workspaceId, taskId, data, io }) {
    const status = data?.status || 'approved';
    const actorId = data?.actorId || null;
    const task = await Task.findOneAndUpdate(
      { workspaceId, _id: taskId },
      {
        $set: {
          approval: {
            required: true,
            status,
            approvedBy: actorId,
            approvedAt: new Date(),
          },
        },
      },
      { returnDocument: 'after', projection: { title: 1, projectId: 1, approval: 1, status: 1, updatedAt: 1 } },
    ).lean();
    if (!task) return null;
    await appendActivity({
      workspaceId,
      module: 'tasks',
      action: 'approved',
      entity: 'task',
      entityId: taskId,
      payload: task.approval,
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'tasks', entity: 'task', action: 'approved', data: task });
    return task;
  },

  async addAttachmentUrl({ workspaceId, taskId, data, io }) {
    const attachment = {
      url: String(data?.url || '').trim(),
      filename: String(data?.filename || '').trim(),
      size: Number(data?.size || 0),
      mimeType: String(data?.mimeType || ''),
      uploadedBy: data?.uploadedBy || null,
      uploadedAt: new Date(),
    };
    if (!attachment.url || !attachment.filename) {
      throw new Error('url and filename are required');
    }
    const storageCheck = await planLimitsService.ensureStorageCapacity(workspaceId, attachment.size);
    if (!storageCheck.allowed) {
      const error = new Error(storageCheck.message);
      error.statusCode = 429;
      error.code = storageCheck.code;
      error.details = storageCheck.details;
      throw error;
    }
    const task = await Task.findOneAndUpdate(
      { workspaceId, _id: taskId },
      { $push: { attachments: attachment } },
      { returnDocument: 'after', projection: { attachments: 1, title: 1, projectId: 1, updatedAt: 1 } },
    ).lean();
    if (!task) return null;
    const saved = task.attachments[task.attachments.length - 1];
    await appendActivity({
      workspaceId,
      module: 'tasks',
      action: 'attachment_url_created',
      entity: 'task',
      entityId: taskId,
      payload: saved,
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'tasks', entity: 'task', action: 'updated', data: task });
    return saved;
  },

  async removeAttachmentUrl({ workspaceId, taskId, attachmentId, io }) {
    const task = await Task.findOneAndUpdate(
      { workspaceId, _id: taskId },
      { $pull: { attachments: { _id: attachmentId } } },
      { returnDocument: 'after', projection: { attachments: 1, title: 1, projectId: 1, updatedAt: 1 } },
    ).lean();
    if (!task) return null;
    await appendActivity({
      workspaceId,
      module: 'tasks',
      action: 'attachment_url_deleted',
      entity: 'task',
      entityId: taskId,
      payload: { attachmentId },
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'tasks', entity: 'task', action: 'updated', data: task });
    return { attachmentId };
  },
};
