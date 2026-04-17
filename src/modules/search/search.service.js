import { Task } from '../../models/task.model.js';
import { Project } from '../../models/project.model.js';
import { Lead } from '../../models/lead.model.js';

export const searchService = {
  async search({ workspaceId, query }) {
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const [tasks, projects, leads] = await Promise.all([
      Task.find(
        { workspaceId, $or: [{ title: regex }, { description: regex }] },
        { title: 1, projectId: 1, status: 1, priority: 1, updatedAt: 1 },
      )
        .sort({ updatedAt: -1 })
        .limit(5)
        .lean(),
      Project.find({ workspaceId, name: regex }, { name: 1, updatedAt: 1 })
        .sort({ updatedAt: -1 })
        .limit(5)
        .lean(),
      Lead.find({ workspaceId, title: regex }, { title: 1, statusId: 1, value: 1, updatedAt: 1 })
        .sort({ updatedAt: -1 })
        .limit(5)
        .lean(),
    ]);

    return {
      tasks: tasks.map((task) => ({
        id: String(task._id),
        title: task.title,
        projectId: task.projectId ? String(task.projectId) : null,
        status: task.status,
        priority: task.priority,
      })),
      projects: projects.map((project) => ({
        id: String(project._id),
        name: project.name,
      })),
      leads: leads.map((lead) => ({
        id: String(lead._id),
        title: lead.title,
        statusId: lead.statusId,
        value: lead.value,
      })),
    };
  },
};
