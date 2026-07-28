import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLeadReminderCadenceLabel,
  getLeadReminderIntervalDays,
  isLeadReminderDue,
  normalizeLeadPriority,
} from './leads.reminders.js';

test('normalizeLeadPriority accepts supported lead categories', () => {
  assert.equal(normalizeLeadPriority('WARM'), 'warm');
  assert.equal(normalizeLeadPriority('cold'), 'cold');
  assert.equal(normalizeLeadPriority(undefined), 'warm');
});

test('normalizeLeadPriority rejects invalid categories', () => {
  assert.throws(() => normalizeLeadPriority('urgent'), /invalid priority/);
});

test('lead reminder cadence returns the configured interval', () => {
  assert.equal(getLeadReminderIntervalDays('warm'), 2);
  assert.equal(getLeadReminderIntervalDays('cold'), 7);
  assert.equal(getLeadReminderCadenceLabel('warm'), 'every 2 days');
  assert.equal(getLeadReminderCadenceLabel('cold'), 'every 7 days');
});

test('lead reminder due check uses assignment and last sent timestamps', () => {
  const now = new Date('2026-07-28T00:00:00.000Z');
  const warmDue = {
    assigneeId: '64f1f1f1f1f1f1f1f1f1f1f1',
    priority: 'warm',
    leadAssignedAt: new Date('2026-07-25T00:00:00.000Z'),
  };
  const coldNotDue = {
    assigneeId: '64f1f1f1f1f1f1f1f1f1f1f1',
    priority: 'cold',
    leadAssignedAt: new Date('2026-07-22T00:00:00.000Z'),
    leadReminderLastSentAt: new Date('2026-07-25T12:00:00.000Z'),
  };

  assert.equal(isLeadReminderDue(warmDue, now), true);
  assert.equal(isLeadReminderDue(coldNotDue, now), false);
});
