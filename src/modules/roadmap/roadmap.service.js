import { Task } from '../../models/task.model.js';
import { Sprint } from '../../models/sprint.model.js';
import { User } from '../../models/user.model.js';

const FINAL_STATUSES = new Set(['completed', 'done', 'closed']);

function taskProgressFromStatus(status) {
  const safe = String(status || '').toLowerCase();
  if (FINAL_STATUSES.has(safe)) return 100;
  if (safe === 'in_review') return 80;
  if (safe === 'in_progress') return 50;
  if (safe === 'todo' || safe === 'planning') return 10;
  return 0;
}

export const roadmapService = {
  async byProject({ workspaceId, projectId }) {
    const [tasks, sprints] = await Promise.all([
      Task.find(
        { workspaceId, projectId },
        { title: 1, status: 1, assigneeIds: 1, dueDate: 1, sprintId: 1, points: 1, createdAt: 1, updatedAt: 1 },
      ).lean(),
      Sprint.find(
        { workspaceId, projectId },
        { name: 1, status: 1, startDate: 1, endDate: 1, createdAt: 1, updatedAt: 1 },
      ).lean(),
    ]);

    const primaryAssigneeIds = Array.from(
      new Set(
        tasks
          .map((task) => (Array.isArray(task.assigneeIds) && task.assigneeIds.length ? String(task.assigneeIds[0]) : ''))
          .filter(Boolean),
      ),
    );
    const users = primaryAssigneeIds.length
      ? await User.find({ workspaceId, _id: { $in: primaryAssigneeIds } }, { _id: 1, displayName: 1 }).lean()
      : [];
    const userMap = new Map(users.map((user) => [String(user._id), String(user.displayName || 'Unknown')]));

    const taskItems = tasks.map((task) => {
      const assigneeId = Array.isArray(task.assigneeIds) && task.assigneeIds.length ? String(task.assigneeIds[0]) : null;
      const status = String(task.status || 'todo');
      return {
        _id: task._id,
        title: task.title,
        type: 'task',
        startDate: task.createdAt || task.updatedAt,
        dueDate: task.dueDate || task.updatedAt,
        statusId: status,
        status,
        assigneeId,
        assigneeName: assigneeId ? userMap.get(assigneeId) || 'Unassigned' : 'Unassigned',
        progress: taskProgressFromStatus(status),
        sprintId: task.sprintId || null,
        points: Number(task.points || 0),
      };
    });
    const sprintItems = sprints.map((sprint) => {
      const status = String(sprint.status || 'planning');
      return {
        _id: sprint._id,
        title: sprint.name,
        type: 'sprint',
        startDate: sprint.startDate || sprint.createdAt || sprint.updatedAt,
        dueDate: sprint.endDate || sprint.updatedAt,
        statusId: status,
        status,
        assigneeId: null,
        assigneeName: 'Unassigned',
        progress: status === 'completed' ? 100 : status === 'active' ? 50 : 0,
      };
    });

    return [...taskItems, ...sprintItems].sort(
      (a, b) => new Date(a.startDate || a.dueDate || 0).getTime() - new Date(b.startDate || b.dueDate || 0).getTime(),
    );
  },
};
