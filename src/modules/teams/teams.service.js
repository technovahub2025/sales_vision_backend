import mongoose from 'mongoose';
import { Team } from '../../models/team.model.js';
import { Project } from '../../models/project.model.js';
import { Task } from '../../models/task.model.js';
import { User } from '../../models/user.model.js';
import { appendActivity } from '../activity/activity.service.js';
import { emitDomainEvent } from '../../sockets/emitters.js';
import { moduleRoom } from '../../sockets/rooms.js';

const TEAM_PROJECTION = {
  name: 1,
  description: 1,
  color: 1,
  leadId: 1,
  memberIds: 1,
  createdAt: 1,
  updatedAt: 1,
};

function parsePage(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
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

export const teamsService = {
  async list({ workspaceId, query = {} }) {
    const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
    const { page, limit, skip } = parsePage(query);
    const where = { workspaceId: workspaceObjectId, isArchived: { $ne: true } };

    const [items, total] = await Promise.all([
      Team.aggregate([
        { $match: where },
        { $sort: { updatedAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: 'sv_projects',
            let: { teamId: '$_id', workspaceId: '$workspaceId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ['$workspaceId', '$$workspaceId'] }, { $eq: ['$teamId', '$$teamId'] }],
                  },
                },
              },
              { $project: { _id: 1 } },
            ],
            as: 'projects',
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            description: 1,
            color: 1,
            leadId: 1,
            memberCount: { $size: { $ifNull: ['$memberIds', []] } },
            activeProjectCount: { $size: '$projects' },
            updatedAt: 1,
          },
        },
      ]),
      Team.countDocuments(where),
    ]);

    return { items, meta: { page, limit, total } };
  },

  async create({ workspaceId, data, actorId, io }) {
    const payload = {
      workspaceId,
      name: String(data?.name || '').trim(),
      description: String(data?.description || ''),
      leadId: data?.leadId || undefined,
      memberIds: Array.isArray(data?.memberIds) ? data.memberIds : [],
      color: String(data?.color || '#64748b'),
    };
    if (!payload.name) throw new Error('name is required');

    const created = await Team.create(payload);
    const team = await Team.findById(created._id, TEAM_PROJECTION).lean();

    await appendActivity({
      workspaceId,
      module: 'teams',
      action: 'created',
      entity: 'team',
      entityId: team._id,
      actor: actorId ? { id: actorId } : undefined,
      payload: team,
    });

    emitDomainEvent(io, { workspaceId, moduleName: 'teams', entity: 'team', action: 'updated', data: team });
    return team;
  },

  async getById({ workspaceId, id }) {
    const team = await Team.findOne({ workspaceId, _id: id, isArchived: { $ne: true } }, TEAM_PROJECTION).lean();
    if (!team) return null;

    const [members, projects] = await Promise.all([
      User.find({ workspaceId, _id: { $in: team.memberIds || [] } }, { displayName: 1, avatarUrl: 1, role: 1 }).lean(),
      Project.find({ workspaceId, teamId: id }, { name: 1, status: 1, progress: 1 }).lean(),
    ]);

    return {
      ...team,
      members: members.map((member) => ({
        _id: String(member._id),
        displayName: member.displayName,
        avatarUrl: member.avatarUrl || '',
        role: member.role || '',
      })),
      projects: projects.map((project) => ({
        _id: String(project._id),
        name: project.name,
        status: project.status,
        progress: project.progress ?? 0,
      })),
    };
  },

  async update({ workspaceId, id, data, actorId, io }) {
    const payload = {
      ...(data?.name !== undefined ? { name: String(data.name || '').trim() } : {}),
      ...(data?.description !== undefined ? { description: String(data.description || '') } : {}),
      ...(data?.leadId !== undefined ? { leadId: data.leadId || null } : {}),
      ...(data?.color !== undefined ? { color: String(data.color || '#64748b') } : {}),
    };
    const team = await Team.findOneAndUpdate(
      { workspaceId, _id: id, isArchived: { $ne: true } },
      { $set: payload },
      { new: true, projection: TEAM_PROJECTION },
    ).lean();
    if (!team) return null;

    await appendActivity({
      workspaceId,
      module: 'teams',
      action: 'updated',
      entity: 'team',
      entityId: team._id,
      actor: actorId ? { id: actorId } : undefined,
      payload,
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'teams', entity: 'team', action: 'updated', data: team });
    return team;
  },

  async addMember({ workspaceId, id, userId, actorId, io }) {
    const team = await Team.findOneAndUpdate(
      { workspaceId, _id: id, isArchived: { $ne: true } },
      { $addToSet: { memberIds: userId } },
      { new: true, projection: TEAM_PROJECTION },
    ).lean();
    if (!team) return null;

    await appendActivity({
      workspaceId,
      module: 'teams',
      action: 'member_changed',
      entity: 'team',
      entityId: team._id,
      actor: actorId ? { id: actorId } : undefined,
      payload: { userId: String(userId), change: 'added' },
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'teams', entity: 'team', action: 'memberChanged', data: { ...team, userId } });
    return team;
  },

  async removeMember({ workspaceId, id, userId, actorId, io }) {
    const team = await Team.findOneAndUpdate(
      { workspaceId, _id: id, isArchived: { $ne: true } },
      { $pull: { memberIds: userId } },
      { new: true, projection: TEAM_PROJECTION },
    ).lean();
    if (!team) return null;

    await appendActivity({
      workspaceId,
      module: 'teams',
      action: 'member_changed',
      entity: 'team',
      entityId: team._id,
      actor: actorId ? { id: actorId } : undefined,
      payload: { userId: String(userId), change: 'removed' },
    });
    emitDomainEvent(io, { workspaceId, moduleName: 'teams', entity: 'team', action: 'memberChanged', data: { ...team, userId } });
    return team;
  },

  async workload({ workspaceId, id }) {
    const workspaceObjectId = requireWorkspaceObjectId(workspaceId);
    const team = await Team.findOne({ workspaceId, _id: id, isArchived: { $ne: true } }, { memberIds: 1, name: 1 }).lean();
    if (!team) return null;

    const [users, taskRows] = await Promise.all([
      User.find({ workspaceId, _id: { $in: team.memberIds || [] } }, { displayName: 1, avatarUrl: 1 }).lean(),
      Task.aggregate([
        {
          $match: {
            workspaceId: workspaceObjectId,
            assigneeIds: { $in: team.memberIds || [] },
            status: { $nin: ['completed', 'done', 'closed'] },
          },
        },
        { $unwind: '$assigneeIds' },
        { $match: { assigneeIds: { $in: team.memberIds || [] } } },
        { $group: { _id: '$assigneeIds', taskCount: { $sum: 1 } } },
      ]),
    ]);

    const rowMap = new Map(taskRows.map((row) => [String(row._id), row.taskCount]));
    return {
      members: users.map((user) => {
        const taskCount = rowMap.get(String(user._id)) || 0;
        return {
          userId: String(user._id),
          name: user.displayName,
          avatar: user.avatarUrl || '',
          taskCount,
          utilization: Math.min(100, taskCount * 12),
        };
      }),
    };
  },

  emitTeamRoomSync(io, workspaceId, payload) {
    io.to(moduleRoom(workspaceId, 'teams')).emit('team:updated', payload);
  },
};
