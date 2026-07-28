import cron from 'node-cron';
import { Employee } from '../../models/employee.model.js';
import { Lead } from '../../models/lead.model.js';
import { isLeadReminderDue } from './leads.reminders.js';
import { sendLeadReminderEmail } from './leads.mailer.js';

let cronTask = null;
let running = false;

async function scanLeadReminders() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const leads = await Lead.find(
      {
        isArchived: { $ne: true },
        assigneeId: { $ne: null },
        priority: { $in: ['warm', 'cold'] },
      },
      {
        workspaceId: 1,
        title: 1,
        priority: 1,
        assigneeId: 1,
        leadAssignedAt: 1,
        leadReminderLastSentAt: 1,
        createdAt: 1,
      },
    ).lean();

    for (const lead of leads) {
      if (!isLeadReminderDue(lead, now)) {
        continue;
      }

      const employee = await Employee.findById(lead.assigneeId, { name: 1, displayName: 1, email: 1 }).lean();
      if (!employee?.email) {
        continue;
      }

      await sendLeadReminderEmail({ lead, employee });
      await Lead.updateOne(
        { _id: lead._id, workspaceId: lead.workspaceId },
        { $set: { leadReminderLastSentAt: now } },
      );
    }
  } finally {
    running = false;
  }
}

export function startLeadReminderScheduler() {
  if (cronTask) return;
  scanLeadReminders().catch((error) => console.error('Lead reminder scheduler initial scan failed', error));

  cronTask = cron.schedule('0 * * * *', () => {
    scanLeadReminders().catch((error) => console.error('Lead reminder scheduler scan failed', error));
  });
}

export function stopLeadReminderScheduler() {
  if (cronTask) {
    cronTask.stop();
    cronTask.destroy();
    cronTask = null;
  }
}

export const __leadReminderSchedulerTestUtils = {
  scanLeadReminders,
};
