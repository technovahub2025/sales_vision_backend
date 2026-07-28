const LEAD_PRIORITIES = new Set(['hot', 'warm', 'cold']);
const LEAD_REMINDER_INTERVAL_DAYS = {
  warm: 2,
  cold: 7,
};

export function normalizeLeadPriority(value) {
  const priority = String(value || 'warm').trim().toLowerCase();
  if (!LEAD_PRIORITIES.has(priority)) {
    throw new Error('invalid priority');
  }
  return priority;
}

export function isReminderPriority(priority) {
  return Object.prototype.hasOwnProperty.call(LEAD_REMINDER_INTERVAL_DAYS, String(priority || '').toLowerCase());
}

export function getLeadReminderIntervalDays(priority) {
  return LEAD_REMINDER_INTERVAL_DAYS[String(priority || '').toLowerCase()] || 0;
}

export function getLeadReminderIntervalMs(priority) {
  return getLeadReminderIntervalDays(priority) * 24 * 60 * 60 * 1000;
}

export function isLeadReminderDue(lead, now = new Date()) {
  if (!lead?.assigneeId || !isReminderPriority(lead?.priority)) {
    return false;
  }

  const lastTouchedAt = lead.leadReminderLastSentAt || lead.leadAssignedAt || lead.createdAt;
  if (!lastTouchedAt) {
    return false;
  }

  const intervalMs = getLeadReminderIntervalMs(lead.priority);
  if (!intervalMs) {
    return false;
  }

  return new Date(now).getTime() - new Date(lastTouchedAt).getTime() >= intervalMs;
}

export function getLeadReminderCadenceLabel(priority) {
  const days = getLeadReminderIntervalDays(priority);
  if (!days) {
    return '';
  }
  return days === 1 ? 'every day' : `every ${days} days`;
}
