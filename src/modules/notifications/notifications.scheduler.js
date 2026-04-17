import cron from 'node-cron';
import { Task } from '../../models/task.model.js';
import { Notification } from '../../models/notification.model.js';
import { notificationsService } from './notifications.service.js';

const FINAL_STATUSES = new Set(['completed', 'done', 'closed']);

let cronTask = null;
let running = false;

async function scanDueSoon(io) {
  if (!io || running) return;
  running = true;
  try {
    const now = new Date();
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tasks = await Task.find(
      {
        dueDate: { $gte: now, $lte: next24h },
        status: { $nin: Array.from(FINAL_STATUSES) },
        assigneeIds: { $exists: true, $ne: [] },
      },
      { workspaceId: 1, title: 1, dueDate: 1, assigneeIds: 1 },
    ).lean();

    for (const task of tasks) {
      const assignees = Array.isArray(task.assigneeIds) ? task.assigneeIds : [];
      for (const userId of assignees) {
        const exists = await Notification.findOne(
          {
            workspaceId: task.workspaceId,
            userId,
            type: 'task_due_soon',
            entityType: 'task',
            entityId: task._id,
            createdAt: { $gte: new Date(now.getTime() - 12 * 60 * 60 * 1000) },
          },
          { _id: 1 },
        ).lean();
        if (exists) continue;

        await notificationsService.create({
          workspaceId: task.workspaceId,
          io,
          data: {
            userId,
            type: 'task_due_soon',
            title: `Task due soon: ${task.title}`,
            body: `Due at ${new Date(task.dueDate).toLocaleString()}`,
            entityType: 'task',
            entityId: task._id,
          },
        });
      }
    }
  } finally {
    running = false;
  }
}

export function startNotificationScheduler(io) {
  if (cronTask) return;
  scanDueSoon(io).catch((error) => console.error('Due soon scheduler initial scan failed', error));

  cronTask = cron.schedule('0 * * * *', () => {
    scanDueSoon(io).catch((error) => console.error('Due soon scheduler scan failed', error));
  });
}

export function stopNotificationScheduler() {
  if (cronTask) {
    cronTask.stop();
    cronTask.destroy();
    cronTask = null;
  }
}
