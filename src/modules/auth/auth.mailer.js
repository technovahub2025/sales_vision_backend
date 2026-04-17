import { sendEmail } from '../../services/mail.service.js';
import { buildInviteEmail, buildResetPasswordEmail, buildWelcomeEmail } from './auth.mailer.templates.js';

const welcomeQueue = [];
const resetQueue = [];
const inviteQueue = [];
let scheduled = false;
let flushing = false;

async function deliver(label, payload, builder) {
  const startedAt = Date.now();
  const to = String(payload?.to || '').trim();
  if (!to) {
    console.error(`[mail:${label}] failed`, JSON.stringify({ reason: 'missing_recipient' }));
    return;
  }

  const { subject, text, html } = builder(payload);

  try {
    const info = await sendEmail({ to, subject, text, html });
    console.log(
      `[mail:${label}] sent`,
      JSON.stringify({
        to,
        provider: String(process.env.MAIL_PROVIDER || ''),
        messageId: String(info?.messageId || ''),
        durationMs: Date.now() - startedAt,
      }),
    );
  } catch (error) {
    console.error(
      `[mail:${label}] failed`,
      JSON.stringify({
        to,
        provider: String(process.env.MAIL_PROVIDER || ''),
        error: String(error?.message || 'unknown_error'),
      }),
    );
  }
}

async function flushQueue(queue, label, builder) {
  while (queue.length) {
    const item = queue.shift();
    await deliver(label, item, builder);
  }
}

async function flushAll() {
  if (flushing) return;
  flushing = true;
  try {
    await flushQueue(welcomeQueue, 'welcome', buildWelcomeEmail);
    await flushQueue(resetQueue, 'reset-password', buildResetPasswordEmail);
    await flushQueue(inviteQueue, 'invite', buildInviteEmail);
  } finally {
    flushing = false;
  }
}

function scheduleFlush() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    void flushAll();
  }, 250);
}

export function queueWelcomeEmail(payload) {
  welcomeQueue.push({ ...payload, queuedAt: new Date().toISOString() });
  scheduleFlush();
}

export function queueResetPasswordEmail(payload) {
  resetQueue.push({ ...payload, queuedAt: new Date().toISOString() });
  scheduleFlush();
}

export function queueInviteEmail(payload) {
  inviteQueue.push({ ...payload, queuedAt: new Date().toISOString() });
  scheduleFlush();
}

export const __mailTestUtils = {
  flushAll,
  resetQueues() {
    welcomeQueue.length = 0;
    resetQueue.length = 0;
    inviteQueue.length = 0;
    scheduled = false;
    flushing = false;
  },
};
