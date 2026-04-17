import mongoose from 'mongoose';
import { Project } from '../../models/project.model.js';
import { Task } from '../../models/task.model.js';
import { User } from '../../models/user.model.js';
import { Activity } from '../../models/activity.model.js';
import { Label } from '../../models/label.model.js';
import { Client } from '../../models/client.model.js';
import { ProjectMember } from '../../models/projectMember.model.js';
import { Team } from '../../models/team.model.js';
import { TimeLog } from '../../models/timeLog.model.js';
import { TaskDependency } from '../../models/taskDependency.model.js';
import { createRepository } from '../../repositories/createRepository.js';
import { appendActivity } from '../activity/activity.service.js';
import { emitCoalesced, emitDomainEvent } from '../../sockets/emitters.js';
import { workflowService } from '../workflow/workflow.service.js';

const repo = createRepository(Project);

const DEFAULT_COLUMNS = [
  { key: 'todo', title: 'To Do', order: 0, colorMeta: 'slate', isDoneColumn: false },
  { key: 'in_progress', title: 'In Progress', order: 1, colorMeta: 'blue', isDoneColumn: false },
  { key: 'in_review', title: 'In Review', order: 2, colorMeta: 'amber', isDoneColumn: false },
  { key: 'completed', title: 'Completed', order: 3, colorMeta: 'green', isDoneColumn: true },
];

const DEFAULT_VIEW = {
  filter: { priority: 'all', assigneeId: 'all', query: '' },
  sort: { by: 'position', direction: 'asc' },
};

const TASK_PROJECTION = {
  title: 1,
  description: 1,
  priority: 1,
  status: 1,
  position: 1,
  dueDate: 1,
  points: 1,
  estimateHours: 1,
  commentsCount: 1,
  activityCount: 1,
  assigneeIds: 1,
  labelIds: 1,
  parentTaskId: 1,
  issueType: 1,
  externalCollaborators: 1,
  primaryAssigneeId: 1,
  createdAt: 1,
  updatedAt: 1,
  projectId: 1,
  workflowId: 1,
  statusId: 1,
  approval: 1,
};

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

function requireProjectObjectId(projectId) {
  const value = toObjectId(projectId);
  if (!value) {
    const error = new Error('Invalid projectId');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  return value;
}

function parsePage(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

const FINAL_STATUSES = new Set(['completed', 'done', 'closed']);

function normalizeColumns(project) {
  const columns = project?.boardConfig?.columns?.length ? project.boardConfig.columns : DEFAULT_COLUMNS;
  return [...columns]
    .map((column, index) => ({
      key: String(column.key),
      title: column.title || column.key,
      order: Number.isFinite(column.order) ? column.order : index,
      colorMeta: column.colorMeta || '',
      isDoneColumn: Boolean(column.isDoneColumn),
      wipLimit: Number.isFinite(column.wipLimit) ? Number(column.wipLimit) : null,
    }))
    .sort((a, b) => a.order - b.order);
}

function normalizeView(project, incomingView) {
  const stored = project?.boardConfig?.view || {};
  const merged = {
    filter: {
      ...DEFAULT_VIEW.filter,
      ...stored.filter,
      ...(incomingView?.filter || {}),
    },
    sort: {
      ...DEFAULT_VIEW.sort,
      ...stored.sort,
      ...(incomingView?.sort || {}),
    },
  };

  merged.filter.query = String(merged.filter.query || '').trim();
  merged.sort.direction = merged.sort.direction === 'desc' ? 'desc' : 'asc';
  return merged;
}

function slugifyColumnKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

function buildTimelineLabel(dueDate) {
  if (!dueDate) {
    return 'No due date';
  }

  const today = new Date();
  const due = new Date(dueDate);
  const diffMs = due.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0);
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays < 0) return `${Math.abs(diffDays)} day${Math.abs(diffDays) > 1 ? 's' : ''} overdue`;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Due in 1 day';
  return `Due in ${diffDays} days`;
}

function applyFilters(tasks, view) {
  return tasks.filter((task) => {
    if (view.filter.priority !== 'all' && task.priority !== view.filter.priority) {
      return false;
    }

    if (view.filter.assigneeId !== 'all') {
      const hasAssignee = (task.assigneeIds || []).some((assignee) => String(assignee._id || assignee) === String(view.filter.assigneeId));
      if (!hasAssignee) {
        return false;
      }
    }

    if (view.filter.query) {
      const q = view.filter.query.toLowerCase();
      const title = String(task.title || '').toLowerCase();
      const description = String(task.description || '').toLowerCase();
      if (!title.includes(q) && !description.includes(q)) {
        return false;
      }
    }

    return true;
  });
}

function applySort(tasks, view) {
  const direction = view.sort.direction === 'desc' ? -1 : 1;
  const by = view.sort.by || 'position';
  return [...tasks].sort((a, b) => {
    if (by === 'priority') {
      const rank = { critical: 0, high: 1, medium: 2, low: 3 };
      const delta = (rank[a.priority] ?? 99) - (rank[b.priority] ?? 99);
      return delta * direction;
    }
    if (by === 'dueDate') {
      const left = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const right = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return (left - right) * direction;
    }
    if (by === 'updatedAt') {
      return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * direction;
    }
    if (by === 'title') {
      return a.title.localeCompare(b.title) * direction;
    }

    return ((a.position ?? 0) - (b.position ?? 0)) * direction;
  });
}

function toBoardTask(task, meta = {}) {
  return {
    ...task,
    id: String(task._id),
    assignees: (task.assigneeIds || []).map((assignee) => ({
      _id: String(assignee._id),
      displayName: assignee.displayName,
      avatarUrl: assignee.avatarUrl || '',
    })),
    timeline: buildTimelineLabel(task.dueDate),
    subtaskCount: Number(meta.subtaskCount || 0),
    labels: meta.labels || [],
    epicTitle: meta.epicTitle || null,
  };
}

function computeVersion(project, tasks) {
  const projectVersion = project?.updatedAt ? new Date(project.updatedAt).getTime() : 0;
  const taskVersion = tasks.reduce((max, task) => Math.max(max, new Date(task.updatedAt).getTime()), 0);
  return Math.max(projectVersion, taskVersion, Date.now());
}

function buildBoardUpdatedEmitter(io, workspaceId, projectId) {
  return () => emitDomainEvent(io, {
    workspaceId,
    moduleName: 'projects',
    entity: 'board',
    action: 'updated',
    data: { projectId: String(projectId) },
  });
}

async function ensureProject({ workspaceId, projectId }) {
  return Project.findOne({ workspaceId, _id: projectId });
}

async function reorderColumn({ workspaceId, projectId, status, taskIds }) {
  if (!taskIds.length) return;
  const bulk = taskIds.map((taskId, index) => ({
    updateOne: {
      filter: { _id: taskId, workspaceId, projectId },
      update: { $set: { status, position: index } },
    },
  }));
  await Task.bulkWrite(bulk);
}

async function reorderColumnWithWorkflow({
  workspaceId,
  projectId,
  status,
  taskIds,
  workflowId = null,
  statusId = null,
}) {
  if (!taskIds.length) return;
  const bulk = taskIds.map((taskId, index) => ({
    updateOne: {
      filter: { _id: taskId, workspaceId, projectId },
      update: {
        $set: {
          status,
          position: index,
          ...(workflowId ? { workflowId } : {}),
          ...(statusId ? { statusId } : {}),
        },
      },
    },
  }));
  await Task.bulkWrite(bulk);
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

export const projectsService = {
  async create({ workspaceId, data, actorId, io }) {
    const ownerId = toObjectId(data?.ownerId || actorId);
    if (!ownerId) {
      throw new Error('ownerId is required');
    }

    const owner = await User.findOne({ _id: ownerId, workspaceId }, { _id: 1 }).lean();
    if (!owner) {
      throw new Error('Owner not found in workspace');
    }

    const project = await Project.create({
      workspaceId,
      name: String(data?.name || '').trim(),
      status: String(data?.status || 'active'),
      ownerId,
      leadId: toObjectId(data?.leadId) || null,
      teamId: toObjectId(data?.teamId) || null,
      clientId: toObjectId(data?.clientId) || null,
      startDate: data?.startDate ? new Date(data.startDate) : undefined,
      endDate: data?.endDate ? new Date(data.endDate) : undefined,
      metadata: data?.metadata && typeof data.metadata === 'object' ? data.metadata : {},
      boardConfig: {
        columns: DEFAULT_COLUMNS,
        view: DEFAULT_VIEW,
      },
    });

    await ProjectMember.updateOne(
      { workspaceId, projectId: project._id, userId: ownerId },
      {
        $set: {
          workspaceId,
          projectId: project._id,
          userId: ownerId,
          role: 'lead',
          isActive: true,
          joinedAt: new Date(),
        },
      },
      { upsert: true },
    );

    const created = await Project.findById(project._id).lean();

    await appendActivity({
      workspaceId,
      module: 'projects',
      action: 'created',
      entity: 'project',
      entityId: project._id,
      payload: { name: created?.name, status: created?.status },
    });

    emitDomainEvent(io, { workspaceId, moduleName: 'projects', entity: 'project', action: 'created', data: created });
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'activity',
      entity: 'activity',
      action: 'appended',
      data: { entity: 'project', action: 'created' },
    });
    emitCoalesced(io, `dashboard:${workspaceId}`, () =>
      emitDomainEvent(io, {
        workspaceId,
        moduleName: 'dashboard',
        entity: 'dashboard',
        action: 'updated',
        data: { workspaceId },
      }),
    );

    return created;
  },

  async update({ workspaceId, projectId, id, data, actorId, io }) {
    const resolvedProjectId = projectId || id;
    const projectObjectId = requireProjectObjectId(resolvedProjectId);
    const workspaceObjectId = requireWorkspaceObjectId(workspaceId);

    const project = await Project.findOne({ _id: projectObjectId, workspaceId: workspaceObjectId }).lean();
    if (!project) {
      throw new Error('Project not found');
    }

    const ownerId = data?.ownerId ? toObjectId(data.ownerId) : project.ownerId;
    if (data?.ownerId) {
      const owner = await User.findOne({ _id: ownerId, workspaceId: workspaceObjectId }, { _id: 1 }).lean();
      if (!owner) {
        throw new Error('Owner not found in workspace');
      }
    }

    const updateData = {
      ...(data?.name !== undefined && { name: String(data.name).trim() }),
      ...(data?.status !== undefined && { status: String(data.status) }),
      ...(data?.progress !== undefined && { progress: Number(data.progress) }),
      ...(data?.ownerId !== undefined && { ownerId }),
      ...(data?.leadId !== undefined && { leadId: toObjectId(data.leadId) || null }),
      ...(data?.teamId !== undefined && { teamId: toObjectId(data.teamId) || null }),
      ...(data?.clientId !== undefined && { clientId: toObjectId(data.clientId) || null }),
      ...(data?.startDate !== undefined && { startDate: data.startDate ? new Date(data.startDate) : undefined }),
      ...(data?.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : undefined }),
      ...(data?.metadata !== undefined && { metadata: typeof data.metadata === 'object' ? data.metadata : {} }),
    };

    const updated = await Project.findByIdAndUpdate(
      projectObjectId,
      { $set: updateData },
      { new: true }
    ).lean();

    // Update project member role if owner changed
    if (data?.ownerId && String(project.ownerId) !== String(ownerId)) {
      await ProjectMember.updateOne(
        { workspaceId: workspaceObjectId, projectId: projectObjectId, userId: ownerId },
        {
          $set: {
            workspaceId: workspaceObjectId,
            projectId: projectObjectId,
            userId: ownerId,
            role: 'lead',
            isActive: true,
            joinedAt: new Date(),
          },
        },
        { upsert: true },
      );
    }

    await appendActivity({
      workspaceId: workspaceObjectId,
      module: 'projects',
      action: 'updated',
      entity: 'project',
      entityId: projectObjectId,
      payload: { name: updated?.name, status: updated?.status },
    });

    emitDomainEvent(io, { workspaceId: workspaceObjectId, moduleName: 'projects', entity: 'project', action: 'updated', data: updated });
    emitDomainEvent(io, {
      workspaceId: workspaceObjectId,
      moduleName: 'activity',
      entity: 'activity',
      action: 'appended',
      data: { entity: 'project', action: 'updated' },
    });
    emitCoalesced(io, `dashboard:${workspaceObjectId}`, () =>
      emitDomainEvent(io, {
        workspaceId: workspaceObjectId,
        moduleName: 'dashboard',
        entity: 'dashboard',
        action: 'updated',
        data: { workspaceId: workspaceObjectId },
      }),
    );

    return updated;
  },

  async delete({ workspaceId, projectId, actorId, io }) {
    const projectObjectId = requireProjectObjectId(projectId);
    const workspaceObjectId = requireWorkspaceObjectId(workspaceId);

    const project = await Project.findOne({ _id: projectObjectId, workspaceId: workspaceObjectId }).lean();
    if (!project) {
      throw new Error('Project not found');
    }

    // Delete all project members
    await ProjectMember.deleteMany({ workspaceId: workspaceObjectId, projectId: projectObjectId });

    // Delete the project
    await Project.deleteOne({ _id: projectObjectId, workspaceId: workspaceObjectId });

    await appendActivity({
      workspaceId: workspaceObjectId,
      module: 'projects',
      action: 'deleted',
      entity: 'project',
      entityId: projectObjectId,
      payload: { name: project?.name, status: project?.status },
    });

    emitDomainEvent(io, { workspaceId: workspaceObjectId, moduleName: 'projects', entity: 'project', action: 'deleted', data: project });
    emitDomainEvent(io, {
      workspaceId: workspaceObjectId,
      moduleName: 'activity',
      entity: 'activity',
      action: 'appended',
      data: { entity: 'project', action: 'deleted' },
    });
    emitCoalesced(io, `dashboard:${workspaceObjectId}`, () =>
      emitDomainEvent(io, {
        workspaceId: workspaceObjectId,
        moduleName: 'dashboard',
        entity: 'dashboard',
        action: 'updated',
        data: { workspaceId: workspaceObjectId },
      }),
    );

    return { success: true };
  },

  list: async ({ workspaceId, query = {} }) => {
    const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
    const { page, limit, skip } = parsePage(query);
    const match = { workspaceId: workspaceObjectId, ...(query.status ? { status: query.status } : {}) };

    const [items, total] = await Promise.all([
      Project.aggregate([
        { $match: match },
        { $sort: { updatedAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: 'sv_project_members',
            let: { projectId: '$_id', workspaceId: '$workspaceId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$workspaceId', '$$workspaceId'] },
                      { $eq: ['$projectId', '$$projectId'] },
                      { $eq: ['$isActive', true] },
                    ],
                  },
                },
              },
              { $project: { _id: 1 } },
            ],
            as: 'members',
          },
        },
        {
          $lookup: {
            from: 'sv_tasks',
            let: { projectId: '$_id', workspaceId: '$workspaceId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ['$workspaceId', '$$workspaceId'] }, { $eq: ['$projectId', '$$projectId'] }],
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  openTaskCount: {
                    $sum: {
                      $cond: [{ $in: ['$status', ['completed', 'done', 'closed']] }, 0, 1],
                    },
                  },
                  overdueTaskCount: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $not: [{ $in: ['$status', ['completed', 'done', 'closed']] }] },
                            { $ne: ['$dueDate', null] },
                            { $lt: ['$dueDate', '$$NOW'] },
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
            as: 'taskStats',
          },
        },
        {
          $lookup: {
            from: 'sv_clients',
            localField: 'clientId',
            foreignField: '_id',
            pipeline: [{ $project: { _id: 1, name: 1 } }],
            as: 'client',
          },
        },
        {
          $lookup: {
            from: 'sv_users',
            localField: 'leadId',
            foreignField: '_id',
            pipeline: [{ $project: { _id: 1, displayName: 1, avatarUrl: 1 } }],
            as: 'lead',
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            status: 1,
            progress: 1,
            startDate: 1,
            endDate: 1,
            ownerId: 1,
            leadId: 1,
            teamId: 1,
            clientId: 1,
            metadata: 1,
            memberCount: { $size: '$members' },
            openTaskCount: { $ifNull: [{ $first: '$taskStats.openTaskCount' }, 0] },
            overdueTaskCount: { $ifNull: [{ $first: '$taskStats.overdueTaskCount' }, 0] },
            clientName: { $ifNull: [{ $first: '$client.name' }, '' ] },
            lead: { $ifNull: [{ $first: '$lead' }, null] },
            updatedAt: 1,
          },
        },
      ]),
      Project.countDocuments(match),
    ]);

    return { items, meta: { page, limit, total } };
  },
  getById: ({ workspaceId, id, projectId }) => repo.getById({ workspaceId, id: projectId || id }),
  remove: ({ workspaceId, id, projectId }) => repo.remove({ workspaceId, id: projectId || id }),

  async overview({ workspaceId, projectId }) {
    const project = await Project.findOne(
      { workspaceId, _id: projectId },
      {
        name: 1,
        status: 1,
        progress: 1,
        startDate: 1,
        endDate: 1,
        ownerId: 1,
        leadId: 1,
        teamId: 1,
        clientId: 1,
        metadata: 1,
        updatedAt: 1,
      },
    ).lean();
    if (!project) return null;

    const workspaceObjectId = requireWorkspaceObjectId(workspaceId);

    const [taskBreakdownRows, members, activity, lead, client, sprintSummary, burndown] = await Promise.all([
      Task.aggregate([
        { $match: { workspaceId: workspaceObjectId, projectId: toObjectId(projectId) } },
        {
          $group: {
            _id: { status: '$status', priority: '$priority' },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            status: '$_id.status',
            priority: '$_id.priority',
            count: 1,
          },
        },
      ]),
      ProjectMember.aggregate([
        { $match: { workspaceId: workspaceObjectId, projectId: toObjectId(projectId), isActive: true } },
        {
          $lookup: {
            from: 'sv_users',
            localField: 'userId',
            foreignField: '_id',
            pipeline: [{ $project: { _id: 1, displayName: 1, avatarUrl: 1 } }],
            as: 'user',
          },
        },
        {
          $lookup: {
            from: 'sv_tasks',
            let: { uid: '$userId' },
            pipeline: [
              {
                $match: {
                  workspaceId: workspaceObjectId,
                  projectId: toObjectId(projectId),
                  $expr: { $in: ['$$uid', '$assigneeIds'] },
                },
              },
              {
                $group: {
                  _id: null,
                  tasksInProject: { $sum: 1 },
                  completedInProject: {
                    $sum: { $cond: [{ $in: ['$status', Array.from(FINAL_STATUSES)] }, 1, 0] },
                  },
                },
              },
            ],
            as: 'taskStats',
          },
        },
        {
          $project: {
            _id: 0,
            userId: '$userId',
            name: { $ifNull: [{ $first: '$user.displayName' }, 'Unknown'] },
            avatar: { $ifNull: [{ $first: '$user.avatarUrl' }, ''] },
            role: 1,
            tasksInProject: { $ifNull: [{ $first: '$taskStats.tasksInProject' }, 0] },
            completedInProject: { $ifNull: [{ $first: '$taskStats.completedInProject' }, 0] },
            totalTimeLoggedInProject: { $literal: 0 },
          },
        },
      ]),
      Activity.find(
        { workspaceId, $or: [{ entity: 'project', entityId: String(projectId) }, { 'payload.projectId': String(projectId) }] },
        { actor: 1, action: 1, message: 1, payload: 1, occurredAt: 1 },
      )
        .sort({ occurredAt: -1 })
        .limit(10)
        .lean(),
      project.leadId
        ? User.findById(project.leadId, { displayName: 1, avatarUrl: 1, role: 1 }).lean()
        : null,
      project.clientId ? Client.findById(project.clientId, { name: 1, status: 1 }).lean() : null,
      Task.aggregate([
        { $match: { workspaceId: workspaceObjectId, projectId: toObjectId(projectId) } },
        {
          $group: {
            _id: null,
            totalTasks: { $sum: 1 },
            completedTasks: { $sum: { $cond: [{ $in: ['$status', Array.from(FINAL_STATUSES)] }, 1, 0] } },
            totalStoryPoints: { $sum: { $ifNull: ['$points', 0] } },
            completedStoryPoints: {
              $sum: {
                $cond: [{ $in: ['$status', Array.from(FINAL_STATUSES)] }, { $ifNull: ['$points', 0] }, 0],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            totalTasks: 1,
            completedTasks: 1,
            totalStoryPoints: 1,
            completedStoryPoints: 1,
            completionPct: {
              $cond: [{ $eq: ['$totalTasks', 0] }, 0, { $round: [{ $multiply: [{ $divide: ['$completedTasks', '$totalTasks'] }, 100] }, 1] }],
            },
          },
        },
      ]).then((rows) => rows[0] || { totalTasks: 0, completedTasks: 0, totalStoryPoints: 0, completedStoryPoints: 0, completionPct: 0 }),
      this.computeBurndown({ workspaceId, projectId }),
    ]);

    const taskBreakdownLegacy = {
      byStatus: taskBreakdownRows.reduce((acc, row) => {
        acc[row.status] = (acc[row.status] || 0) + row.count;
        return acc;
      }, {}),
      byPriority: taskBreakdownRows.reduce((acc, row) => {
        acc[row.priority] = (acc[row.priority] || 0) + row.count;
        return acc;
      }, {}),
    };
    const taskBreakdown = [
      ...Object.entries(taskBreakdownLegacy.byStatus).map(([key, count]) => ({ kind: 'status', key, count })),
      ...Object.entries(taskBreakdownLegacy.byPriority).map(([key, count]) => ({ kind: 'priority', key, count })),
    ];
    const teamWorkload = members.map((member) => {
      const tasksInProject = Number(member.tasksInProject || 0);
      const completedInProject = Number(member.completedInProject || 0);
      const utilizationPercent = tasksInProject > 0 ? Math.min(100, Math.round((completedInProject / tasksInProject) * 100)) : 0;
      return {
        userId: String(member.userId || ''),
        name: member.name,
        avatar: member.avatar,
        role: member.role,
        tasksInProject,
        completedInProject,
        utilizationPercent,
        utilization: utilizationPercent,
        totalTimeLoggedInProject: Number(member.totalTimeLoggedInProject || 0),
      };
    });
    const recentActivity = (activity || []).map((item) => ({
      _id: item._id ? String(item._id) : '',
      action: String(item.action || 'updated'),
      entity: String(item.entity || item.payload?.entity || 'project'),
      message: String(item.message || `${item.action || 'updated'} ${item.entity || item.payload?.entity || 'project'}`),
      occurredAt: item.occurredAt || item.createdAt || null,
    }));

    return {
      projectDetails: {
        ...project,
        lead: lead
          ? {
              _id: String(lead._id),
              displayName: lead.displayName,
              avatarUrl: lead.avatarUrl || '',
              role: lead.role || '',
            }
          : null,
        client: client
          ? {
              _id: String(client._id),
              name: client.name,
              status: client.status,
            }
          : null,
      },
      milestones: Array.isArray(project?.metadata?.milestones) ? project.metadata.milestones : [],
      sprintSummary,
      taskBreakdown,
      taskBreakdownLegacy,
      teamWorkload,
      burndown,
      recentActivity,
    };
  },

  async computeBurndown({ workspaceId, projectId }) {
    const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - 13);
    start.setHours(0, 0, 0, 0);

    const rows = await Task.aggregate([
      { $match: { workspaceId: workspaceObjectId, projectId: toObjectId(projectId), points: { $gt: 0 } } },
      {
        $project: {
          points: { $ifNull: ['$points', 0] },
          completedAt: {
            $cond: [{ $in: ['$status', Array.from(FINAL_STATUSES)] }, '$updatedAt', null],
          },
        },
      },
    ]);

    const total = rows.reduce((sum, row) => sum + row.points, 0);
    const doneByDay = new Map();
    for (const row of rows) {
      if (!row.completedAt) continue;
      const key = new Date(row.completedAt).toISOString().slice(0, 10);
      doneByDay.set(key, (doneByDay.get(key) || 0) + row.points);
    }

    const points = [];
    let completed = 0;
    for (let i = 0; i < 14; i += 1) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const key = day.toISOString().slice(0, 10);
      completed += doneByDay.get(key) || 0;
      const remaining = Math.max(0, total - completed);
      const ideal = Math.max(0, total - (total / 13) * i);
      points.push({ day: key, remaining, ideal: Math.round(ideal) });
    }

    return points;
  },

  async listMembers({ workspaceId, projectId }) {
    const project = await Project.findOne({ workspaceId, _id: projectId }, { _id: 1 }).lean();
    if (!project) return null;

    const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
    const members = await ProjectMember.aggregate([
      { $match: { workspaceId: workspaceObjectId, projectId: toObjectId(projectId), isActive: true } },
      {
        $lookup: {
          from: 'sv_users',
          localField: 'userId',
          foreignField: '_id',
          pipeline: [{ $project: { _id: 1, displayName: 1, avatarUrl: 1 } }],
          as: 'user',
        },
      },
      {
        $lookup: {
          from: 'sv_tasks',
          let: { uid: '$userId' },
          pipeline: [
            {
              $match: {
                workspaceId,
                projectId: toObjectId(projectId),
                $expr: { $in: ['$$uid', '$assigneeIds'] },
              },
            },
            {
              $group: {
                _id: null,
                tasksInProject: { $sum: 1 },
                completedInProject: { $sum: { $cond: [{ $in: ['$status', Array.from(FINAL_STATUSES)] }, 1, 0] } },
              },
            },
          ],
          as: 'stats',
        },
      },
      {
        $project: {
          _id: 0,
          userId: '$userId',
          name: { $ifNull: [{ $first: '$user.displayName' }, 'Unknown'] },
          avatar: { $ifNull: [{ $first: '$user.avatarUrl' }, ''] },
          role: 1,
          joinedAt: 1,
          tasksInProject: { $ifNull: [{ $first: '$stats.tasksInProject' }, 0] },
          completedInProject: { $ifNull: [{ $first: '$stats.completedInProject' }, 0] },
          totalTimeLoggedInProject: { $literal: 0 },
        },
      },
      { $sort: { role: 1, joinedAt: 1 } },
    ]);

    return members;
  },

  async addMember({ workspaceId, projectId, userId, role = 'member', actorId, io }) {
    const project = await Project.findOne({ workspaceId, _id: projectId }, { _id: 1 }).lean();
    if (!project) return null;

    const user = await User.findOne({ workspaceId, _id: userId }, { _id: 1, displayName: 1, avatarUrl: 1 }).lean();
    if (!user) {
      throw new Error('User not found');
    }

    const result = await ProjectMember.findOneAndUpdate(
      { workspaceId, projectId, userId },
      { $set: { role, isActive: true }, $setOnInsert: { joinedAt: new Date() } },
      { upsert: true, new: true, projection: { projectId: 1, userId: 1, role: 1, joinedAt: 1, isActive: 1 } },
    ).lean();

    await appendActivity({
      workspaceId,
      module: 'projects',
      action: 'member_added',
      entity: 'project',
      entityId: projectId,
      actor: actorId ? { id: actorId } : undefined,
      payload: { projectId: String(projectId), userId: String(userId), role },
    });

    const data = {
      projectId: String(projectId),
      userId: String(result.userId),
      name: user.displayName,
      avatar: user.avatarUrl || '',
      role: result.role,
      joinedAt: result.joinedAt,
    };
    emitDomainEvent(io, { workspaceId, moduleName: 'projects', entity: 'project', action: 'memberAdded', data });

    return data;
  },

  async updateMemberRole({ workspaceId, projectId, userId, role, actorId, io }) {
    const updated = await ProjectMember.findOneAndUpdate(
      { workspaceId, projectId, userId, isActive: true },
      { $set: { role } },
      { new: true, projection: { projectId: 1, userId: 1, role: 1, joinedAt: 1 } },
    ).lean();
    if (!updated) return null;

    await appendActivity({
      workspaceId,
      module: 'projects',
      action: 'member_role_updated',
      entity: 'project',
      entityId: projectId,
      actor: actorId ? { id: actorId } : undefined,
      payload: { userId: String(userId), role },
    });

    const data = { projectId: String(projectId), userId: String(userId), role: updated.role };
    emitDomainEvent(io, { workspaceId, moduleName: 'projects', entity: 'project', action: 'updated', data });
    return data;
  },

  async removeMember({ workspaceId, projectId, userId, actorId, io }) {
    const removed = await ProjectMember.findOneAndUpdate(
      { workspaceId, projectId, userId, isActive: true },
      { $set: { isActive: false } },
      { new: true, projection: { projectId: 1, userId: 1, role: 1, isActive: 1 } },
    ).lean();
    if (!removed) return null;

    await appendActivity({
      workspaceId,
      module: 'projects',
      action: 'member_removed',
      entity: 'project',
      entityId: projectId,
      actor: actorId ? { id: actorId } : undefined,
      payload: { userId: String(userId) },
    });

    const data = { projectId: String(projectId), userId: String(userId) };
    emitDomainEvent(io, { workspaceId, moduleName: 'projects', entity: 'project', action: 'memberRemoved', data });
    return data;
  },

  async timeLogs({ workspaceId, projectId, query = {} }) {
    const project = await Project.findOne({ workspaceId, _id: projectId }, { _id: 1 }).lean();
    if (!project) return null;
    const workspaceObjectId = requireWorkspaceObjectId(workspaceId);

    const taskRows = await Task.find({ workspaceId, projectId }, { _id: 1 }).lean();
    const taskIds = taskRows.map((row) => row._id);
    const where = { workspaceId: workspaceObjectId, taskId: { $in: taskIds }, isDeleted: { $ne: true } };
    if (query.from || query.to) {
      where.loggedAt = {};
      if (query.from) where.loggedAt.$gte = new Date(query.from);
      if (query.to) where.loggedAt.$lte = new Date(query.to);
    }

    const rows = await TimeLog.aggregate([
      { $match: where },
      { $group: { _id: '$employeeId', totalMins: { $sum: '$durationMins' }, entries: { $sum: 1 } } },
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

    return { items: rows, meta: { taskCount: taskRows.length } };
  },

  async board({ workspaceId, projectId, query }) {
    const project = await Project.findOne({ workspaceId, _id: projectId }).lean();
    if (!project) {
      return { project: null };
    }

    const view = normalizeView(project, query?.view);
    const columns = normalizeColumns(project);
    const columnMap = new Map(columns.map((column) => [column.key, { ...column, tasks: [] }]));
    const groupBy = ['assignee', 'epic'].includes(String(query?.groupBy || '')) ? String(query.groupBy) : 'none';

    const tasksRaw = await Task.find({ workspaceId, projectId, archived: { $ne: true } }, TASK_PROJECTION)
      .populate('assigneeIds', 'displayName avatarUrl')
      .lean();
    const labelIds = Array.from(
      new Set((tasksRaw || []).flatMap((task) => (task.labelIds || []).map((id) => String(id)))),
    );
    const [labels, subtaskCounts] = await Promise.all([
      labelIds.length ? Label.find({ workspaceId, _id: { $in: labelIds } }, { name: 1, color: 1 }).lean() : [],
      Task.aggregate([
        { $match: { workspaceId: new mongoose.Types.ObjectId(String(workspaceId)), projectId: new mongoose.Types.ObjectId(String(projectId)), parentTaskId: { $ne: null }, archived: { $ne: true } } },
        { $group: { _id: '$parentTaskId', count: { $sum: 1 } } },
      ]),
    ]);
    const labelMap = new Map(labels.map((label) => [String(label._id), { _id: String(label._id), name: label.name, color: label.color }]));
    const subtaskMap = new Map((subtaskCounts || []).map((row) => [String(row._id), Number(row.count || 0)]));
    const epicTitleMap = new Map((tasksRaw || []).map((task) => [String(task._id), task.title]));

    const filteredTasks = applySort(applyFilters(tasksRaw, view), view);
    for (const task of filteredTasks) {
      if (!columnMap.has(task.status)) {
        continue;
      }
      const labelsForTask = (task.labelIds || []).map((id) => labelMap.get(String(id))).filter(Boolean);
      columnMap.get(task.status).tasks.push(
        toBoardTask(task, {
          labels: labelsForTask,
          subtaskCount: subtaskMap.get(String(task._id)) || 0,
          epicTitle: task.parentTaskId ? epicTitleMap.get(String(task.parentTaskId)) || 'Unknown epic' : null,
        }),
      );
    }

    const dataColumns = columns.map((column) => {
      const tasks = columnMap.get(column.key)?.tasks || [];
      return {
        ...column,
        count: tasks.length,
        tasks,
      };
    });

    const baseResponse = {
      project: {
        _id: String(project._id),
        name: project.name,
        status: project.status,
      },
      columns: dataColumns,
      viewState: view,
      groupBy,
      filterOptions: {
        priorities: ['all', 'critical', 'high', 'medium', 'low'],
        sorts: ['position', 'updatedAt', 'dueDate', 'priority', 'title'],
      },
      totals: {
        total: filteredTasks.length,
        version: computeVersion(project, tasksRaw),
      },
    };
    if (groupBy === 'none') {
      return baseResponse;
    }

    const baseLaneColumns = columns.map((column) => ({
      ...column,
      tasks: [],
      count: 0,
    }));
    const laneMap = new Map();
    const ensureLane = (key, label) => {
      if (!laneMap.has(key)) {
        laneMap.set(key, { key, label, columns: baseLaneColumns.map((col) => ({ ...col, tasks: [], count: 0 })) });
      }
      return laneMap.get(key);
    };

    for (const task of filteredTasks) {
      const boardTask = toBoardTask(task, {
        labels: (task.labelIds || []).map((id) => labelMap.get(String(id))).filter(Boolean),
        subtaskCount: subtaskMap.get(String(task._id)) || 0,
        epicTitle: task.parentTaskId ? epicTitleMap.get(String(task.parentTaskId)) || 'Unknown epic' : null,
      });
      let laneKey = 'unassigned';
      let laneLabel = 'Unassigned';
      if (groupBy === 'assignee') {
        const primary = (boardTask.assignees || [])[0];
        if (primary?._id) {
          laneKey = primary._id;
          laneLabel = primary.displayName || 'Assignee';
        }
      } else if (groupBy === 'epic') {
        if (task.parentTaskId) {
          laneKey = String(task.parentTaskId);
          laneLabel = boardTask.epicTitle || 'Epic';
        } else {
          laneKey = 'no_epic';
          laneLabel = 'No epic';
        }
      }

      const lane = ensureLane(laneKey, laneLabel);
      const column = lane.columns.find((col) => col.key === task.status);
      if (column) {
        column.tasks.push(boardTask);
        column.count = column.tasks.length;
      }
    }

    return {
      ...baseResponse,
      swimlanes: Array.from(laneMap.values()),
    };
  },

  async updateBoardView({ workspaceId, projectId, view, io }) {
    const project = await ensureProject({ workspaceId, projectId });
    if (!project) return null;

    const nextView = normalizeView(project, view);
    project.boardConfig = {
      ...(project.boardConfig?.toObject?.() || project.boardConfig || {}),
      view: nextView,
      columns: normalizeColumns(project),
    };
    await project.save();

    await appendActivity({
      workspaceId,
      module: 'projects',
      action: 'view_updated',
      entity: 'board',
      entityId: projectId,
      payload: nextView,
    });

    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'projects',
      entity: 'board',
      action: 'view_updated',
      data: { projectId: String(projectId), viewState: nextView },
    });
    emitCoalesced(io, `board:${workspaceId}:${projectId}`, buildBoardUpdatedEmitter(io, workspaceId, projectId));

    return { viewState: nextView, version: new Date(project.updatedAt).getTime() };
  },

  async createBoardColumn({ workspaceId, projectId, data, io }) {
    const project = await ensureProject({ workspaceId, projectId });
    if (!project) return null;

    const existingColumns = normalizeColumns(project);
    const existingKeys = new Set(existingColumns.map((column) => column.key));
    const title = String(data?.title || '').trim();
    if (!title) {
      throw new Error('title is required');
    }

    let key = slugifyColumnKey(data?.key || title);
    if (!key) key = `column_${Date.now()}`;
    while (existingKeys.has(key)) {
      key = `${key}_${Math.floor(Math.random() * 10)}`;
    }

    const nextColumn = {
      key,
      title,
      order: existingColumns.length,
      colorMeta: String(data?.colorMeta || ''),
      isDoneColumn: Boolean(data?.isDoneColumn),
      wipLimit: Number.isFinite(data?.wipLimit) ? Number(data.wipLimit) : null,
    };

    project.boardConfig = {
      ...(project.boardConfig?.toObject?.() || project.boardConfig || {}),
      columns: [...existingColumns, nextColumn],
      view: normalizeView(project),
    };
    await project.save();

    await appendActivity({
      workspaceId,
      module: 'projects',
      action: 'column_created',
      entity: 'board',
      entityId: projectId,
      payload: nextColumn,
    });

    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'projects',
      entity: 'board',
      action: 'column_created',
      data: { projectId: String(projectId), column: nextColumn },
    });
    emitCoalesced(io, `board:${workspaceId}:${projectId}`, buildBoardUpdatedEmitter(io, workspaceId, projectId));

    return { column: nextColumn, version: new Date(project.updatedAt).getTime() };
  },

  async updateBoardColumn({ workspaceId, projectId, columnKey, data, io }) {
    const project = await ensureProject({ workspaceId, projectId });
    if (!project) return null;

    const columns = normalizeColumns(project);
    const index = columns.findIndex((column) => column.key === columnKey);
    if (index < 0) return { notFound: true };

    const nextColumns = columns.map((column, idx) =>
      idx === index
          ? {
              ...column,
              title: data?.title ? String(data.title).trim() : column.title,
              colorMeta: data?.colorMeta !== undefined ? String(data.colorMeta || '') : column.colorMeta,
              isDoneColumn: data?.isDoneColumn !== undefined ? Boolean(data.isDoneColumn) : column.isDoneColumn,
              wipLimit: data?.wipLimit !== undefined ? (data.wipLimit === null ? null : Number(data.wipLimit)) : column.wipLimit,
            }
          : column,
    );

    if (Number.isFinite(data?.order)) {
      const [picked] = nextColumns.splice(index, 1);
      const target = Math.min(Math.max(0, Number(data.order)), nextColumns.length);
      nextColumns.splice(target, 0, picked);
    }

    const orderedColumns = nextColumns.map((column, order) => ({ ...column, order }));
    project.boardConfig = {
      ...(project.boardConfig?.toObject?.() || project.boardConfig || {}),
      columns: orderedColumns,
      view: normalizeView(project),
    };
    await project.save();

    await appendActivity({
      workspaceId,
      module: 'projects',
      action: 'column_updated',
      entity: 'board',
      entityId: projectId,
      payload: { columnKey, updates: data || {} },
    });

    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'projects',
      entity: 'board',
      action: 'column_updated',
      data: { projectId: String(projectId), columnKey, columns: orderedColumns },
    });
    emitCoalesced(io, `board:${workspaceId}:${projectId}`, buildBoardUpdatedEmitter(io, workspaceId, projectId));

    return { columns: orderedColumns, version: new Date(project.updatedAt).getTime() };
  },

  async createBoardTask({ workspaceId, projectId, data, io }) {
    const project = await ensureProject({ workspaceId, projectId });
    if (!project) return null;

    const columns = normalizeColumns(project);
    const requestedStatus = data?.status && columns.some((column) => column.key === data.status) ? data.status : columns[0].key;
    const resolvedStatus = await workflowService.resolveTaskStatus({
      workspaceId,
      workflowId: data?.workflowId || null,
      statusId: data?.statusId || null,
      statusKey: requestedStatus,
    });
    const status = resolvedStatus.key || requestedStatus;
    const maxPositionTask = await Task.findOne({ workspaceId, projectId, status })
      .sort({ position: -1 })
      .select({ position: 1 })
      .lean();
    const position = (maxPositionTask?.position ?? -1) + 1;

    const task = await Task.create({
      workspaceId,
      projectId,
      workflowId: resolvedStatus.workflowId || null,
      statusId: resolvedStatus.statusId || null,
      title: String(data?.title || '').trim(),
      description: String(data?.description || ''),
      priority: data?.priority || 'medium',
      status,
      dueDate: data?.dueDate || undefined,
      assigneeIds: Array.isArray(data?.assigneeIds) ? data.assigneeIds : [],
      points: Number(data?.points || 0),
      estimateHours: Number(data?.estimateHours || 0),
      tags: Array.isArray(data?.tags) ? data.tags : [],
      position,
    });

    const populatedTask = await Task.findById(task._id, TASK_PROJECTION).populate('assigneeIds', 'displayName avatarUrl').lean();

    await appendActivity({
      workspaceId,
      module: 'tasks',
      action: 'created',
      entity: 'task',
      entityId: task._id,
      payload: populatedTask,
    });

    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'tasks',
      entity: 'task',
      action: 'created',
      data: populatedTask,
    });
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'activity',
      entity: 'activity',
      action: 'appended',
      data: { entity: 'task', action: 'created' },
    });
    emitCoalesced(io, `board:${workspaceId}:${projectId}`, buildBoardUpdatedEmitter(io, workspaceId, projectId));
    emitCoalesced(io, `dashboard:${workspaceId}`, () =>
      emitDomainEvent(io, {
        workspaceId,
        moduleName: 'dashboard',
        entity: 'dashboard',
        action: 'updated',
        data: { workspaceId },
      }),
    );

    return { task: toBoardTask(populatedTask), version: Date.now() };
  },

  async moveBoardTask({ workspaceId, projectId, taskId, toColumnKey, toPosition, io }) {
    const project = await ensureProject({ workspaceId, projectId });
    if (!project) return null;

    const columns = normalizeColumns(project);
    if (!columns.some((column) => column.key === toColumnKey)) {
      throw new Error('Invalid target column');
    }

    const task = await Task.findOne({ workspaceId, projectId, _id: taskId }).lean();
    if (!task) return { task: null };

    const fromColumnKey = task.status;
    const resolvedCurrentStatus = await workflowService.resolveTaskStatus({
      workspaceId,
      workflowId: task.workflowId || null,
      statusId: task.statusId || null,
      statusKey: task.status || null,
    });
    const resolvedNextStatus = await workflowService.resolveTaskStatus({
      workspaceId,
      workflowId: task.workflowId || null,
      statusId: null,
      statusKey: toColumnKey,
    });
    const nextColumnKey = resolvedNextStatus.key || toColumnKey;
    const isAllowed = await workflowService.validateTransition({
      workspaceId,
      workflowId: resolvedNextStatus.workflowId || task.workflowId || null,
      fromStatusId: resolvedCurrentStatus.statusId || task.statusId || null,
      toStatusId: resolvedNextStatus.statusId || null,
    });
    if (!isAllowed) {
      throw new Error('Invalid workflow transition');
    }
    if (FINAL_STATUSES.has(String(nextColumnKey || ''))) {
      if (task?.approval?.required && task?.approval?.status !== 'approved') {
        throw new Error('Approval pending');
      }
      const blocked = await hasBlockingDependency({ workspaceId, taskId });
      if (blocked) {
        throw new Error('Blocked by open dependencies');
      }
    }

    if (fromColumnKey === nextColumnKey) {
      const sameColumnTasks = await Task.find({ workspaceId, projectId, status: fromColumnKey })
        .sort({ position: 1, updatedAt: -1 })
        .select({ _id: 1 })
        .lean();
      const orderedIds = sameColumnTasks.map((item) => String(item._id)).filter((id) => id !== String(taskId));
      const target = Math.min(Math.max(0, Number(toPosition ?? orderedIds.length)), orderedIds.length);
      orderedIds.splice(target, 0, String(taskId));
      await reorderColumn({ workspaceId, projectId, status: fromColumnKey, taskIds: orderedIds });
    } else {
      const [fromTasks, toTasks] = await Promise.all([
        Task.find({ workspaceId, projectId, status: fromColumnKey }).sort({ position: 1 }).select({ _id: 1 }).lean(),
        Task.find({ workspaceId, projectId, status: nextColumnKey }).sort({ position: 1 }).select({ _id: 1 }).lean(),
      ]);

      const fromIds = fromTasks.map((item) => String(item._id)).filter((id) => id !== String(taskId));
      const toIds = toTasks.map((item) => String(item._id));
      const target = Math.min(Math.max(0, Number(toPosition ?? toIds.length)), toIds.length);
      toIds.splice(target, 0, String(taskId));

      await Promise.all([
        reorderColumn({ workspaceId, projectId, status: fromColumnKey, taskIds: fromIds }),
        reorderColumnWithWorkflow({
          workspaceId,
          projectId,
          status: nextColumnKey,
          taskIds: toIds,
          workflowId: resolvedNextStatus.workflowId || task.workflowId || null,
          statusId: resolvedNextStatus.statusId || null,
        }),
      ]);
    }

    const updatedTask = await Task.findOne({ workspaceId, projectId, _id: taskId }, TASK_PROJECTION)
      .populate('assigneeIds', 'displayName avatarUrl')
      .lean();

    await appendActivity({
      workspaceId,
      module: 'tasks',
      action: 'moved',
      entity: 'task',
      entityId: taskId,
      payload: {
        taskId: String(taskId),
        projectId: String(projectId),
        from: fromColumnKey,
        to: nextColumnKey,
        toPosition: Number(toPosition ?? 0),
      },
    });

    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'tasks',
      entity: 'task',
      action: 'moved',
      data: updatedTask,
    });
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'tasks',
      entity: 'task',
      action: 'updated',
      data: updatedTask,
    });
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'activity',
      entity: 'activity',
      action: 'appended',
      data: { entity: 'task', action: 'moved' },
    });
    emitCoalesced(io, `board:${workspaceId}:${projectId}`, buildBoardUpdatedEmitter(io, workspaceId, projectId));
    emitCoalesced(io, `dashboard:${workspaceId}`, () =>
      emitDomainEvent(io, {
        workspaceId,
        moduleName: 'dashboard',
        entity: 'dashboard',
        action: 'updated',
        data: { workspaceId },
      }),
    );

    return { task: toBoardTask(updatedTask), version: Date.now() };
  },

  async deleteBoardColumn({ workspaceId, projectId, columnKey, targetColumnKey, io }) {
    const project = await ensureProject({ workspaceId, projectId });
    if (!project) return null;

    const columns = normalizeColumns(project);
    if (columns.length <= 1) {
      throw new Error('Project must have at least one column');
    }

    const deletingIndex = columns.findIndex((column) => column.key === columnKey);
    if (deletingIndex < 0) return { notFound: true };

    const fallbackColumn =
      columns.find((column) => column.key === targetColumnKey && column.key !== columnKey) ||
      columns.find((column) => column.key !== columnKey);
    if (!fallbackColumn) {
      throw new Error('No target column available');
    }

    const [existingFallbackTasks, movingTasks] = await Promise.all([
      Task.find({ workspaceId, projectId, status: fallbackColumn.key })
        .sort({ position: 1, updatedAt: -1 })
        .select({ _id: 1 })
        .lean(),
      Task.find({ workspaceId, projectId, status: columnKey })
        .sort({ position: 1, updatedAt: -1 })
        .select({ _id: 1 })
        .lean(),
    ]);

    const orderedTaskIds = [
      ...existingFallbackTasks.map((item) => String(item._id)),
      ...movingTasks.map((item) => String(item._id)),
    ];
    if (orderedTaskIds.length) {
      const fallbackStatus = await workflowService.resolveTaskStatus({
        workspaceId,
        workflowId: null,
        statusId: null,
        statusKey: fallbackColumn.key,
      });
      await reorderColumnWithWorkflow({
        workspaceId,
        projectId,
        status: fallbackStatus.key || fallbackColumn.key,
        taskIds: orderedTaskIds,
        workflowId: fallbackStatus.workflowId || null,
        statusId: fallbackStatus.statusId || null,
      });
    }

    const nextColumns = columns
      .filter((column) => column.key !== columnKey)
      .map((column, index) => ({ ...column, order: index }));
    project.boardConfig = {
      ...(project.boardConfig?.toObject?.() || project.boardConfig || {}),
      columns: nextColumns,
      view: normalizeView(project),
    };
    await project.save();

    await appendActivity({
      workspaceId,
      module: 'projects',
      action: 'column_deleted',
      entity: 'board',
      entityId: projectId,
      payload: {
        deletedColumnKey: columnKey,
        movedTaskCount: movingTasks.length,
        targetColumnKey: fallbackColumn.key,
      },
    });

    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'projects',
      entity: 'board',
      action: 'column_deleted',
      data: { projectId: String(projectId), columnKey, targetColumnKey: fallbackColumn.key },
    });
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'activity',
      entity: 'activity',
      action: 'appended',
      data: { entity: 'board', action: 'column_deleted' },
    });
    emitCoalesced(io, `board:${workspaceId}:${projectId}`, buildBoardUpdatedEmitter(io, workspaceId, projectId));
    emitCoalesced(io, `dashboard:${workspaceId}`, () =>
      emitDomainEvent(io, {
        workspaceId,
        moduleName: 'dashboard',
        entity: 'dashboard',
        action: 'updated',
        data: { workspaceId },
      }),
    );

    return { columns: nextColumns, version: Date.now() };
  },

  async deleteBoardTask({ workspaceId, projectId, taskId, io }) {
    const project = await ensureProject({ workspaceId, projectId });
    if (!project) return null;

    const task = await Task.findOneAndDelete({ workspaceId, projectId, _id: taskId }).lean();
    if (!task) return { task: null };

    const sameColumnTasks = await Task.find({ workspaceId, projectId, status: task.status })
      .sort({ position: 1, updatedAt: -1 })
      .select({ _id: 1 })
      .lean();
    await reorderColumn({
      workspaceId,
      projectId,
      status: task.status,
      taskIds: sameColumnTasks.map((item) => String(item._id)),
    });

    await appendActivity({
      workspaceId,
      module: 'tasks',
      action: 'deleted',
      entity: 'task',
      entityId: task._id,
      payload: task,
    });

    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'tasks',
      entity: 'task',
      action: 'deleted',
      data: task,
    });
    emitDomainEvent(io, {
      workspaceId,
      moduleName: 'activity',
      entity: 'activity',
      action: 'appended',
      data: { entity: 'task', action: 'deleted' },
    });
    emitCoalesced(io, `board:${workspaceId}:${projectId}`, buildBoardUpdatedEmitter(io, workspaceId, projectId));
    emitCoalesced(io, `dashboard:${workspaceId}`, () =>
      emitDomainEvent(io, {
        workspaceId,
        moduleName: 'dashboard',
        entity: 'dashboard',
        action: 'updated',
        data: { workspaceId },
      }),
    );

    return { task, version: Date.now() };
  },
};
