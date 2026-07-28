import { sendEmail } from '../../services/mail.service.js';
import { getLeadReminderCadenceLabel, getLeadReminderIntervalDays } from './leads.reminders.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildRecipientName(employee) {
  return String(employee?.name || employee?.displayName || employee?.email || 'there').trim();
}

function buildPriorityLabel(priority) {
  const value = String(priority || '').trim().toLowerCase();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Lead';
}

export function buildLeadReminderEmail({ lead, employee }) {
  const cadence = getLeadReminderCadenceLabel(lead?.priority);
  const intervalDays = getLeadReminderIntervalDays(lead?.priority);
  const recipientName = escapeHtml(buildRecipientName(employee));
  const priorityLabel = buildPriorityLabel(lead?.priority);
  const leadTitle = String(lead?.title || 'Lead').trim();
  const leadTitleHtml = escapeHtml(leadTitle);
  const subject = `Lead reminder: ${leadTitle}`;
  const text = [
    `Hi ${recipientName},`,
    '',
    `This is a reminder to follow up on lead "${leadTitle}".`,
    `Category: ${priorityLabel}`,
    cadence ? `Cadence: ${cadence}` : '',
    intervalDays ? `Please review it before the next ${intervalDays}-day reminder window.` : '',
    '',
    'Thanks.',
  ].filter(Boolean).join('\n');

  const html = `
    <p>Hi ${recipientName},</p>
    <p>This is a reminder to follow up on lead <strong>${leadTitleHtml}</strong>.</p>
    <p><strong>Category:</strong> ${escapeHtml(priorityLabel)}</p>
    ${cadence ? `<p><strong>Cadence:</strong> ${cadence}</p>` : ''}
    ${intervalDays ? `<p>Please review it before the next ${intervalDays}-day reminder window.</p>` : ''}
    <p>Thanks.</p>
  `;

  return { subject, text, html };
}

export async function sendLeadReminderEmail({ lead, employee }) {
  if (!lead || !employee?.email) {
    return null;
  }

  const payload = buildLeadReminderEmail({ lead, employee });
  return sendEmail({
    to: employee.email,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
}
