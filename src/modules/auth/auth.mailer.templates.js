function baseAppUrl() {
  return String(process.env.APP_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173').replace(/\/+$/, '');
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toUTCString();
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildResetPasswordLink(token) {
  return `${baseAppUrl()}/reset-password/${encodeURIComponent(String(token || ''))}`;
}

export function buildInviteEmail(payload) {
  const workspaceName = String(payload.workspaceName || 'your workspace');
  const inviterName = String(payload.inviterName || 'A teammate');
  const role = String(payload.role || 'member');
  const inviteLink = String(payload.inviteLink || '');
  const expiresAtLabel = formatDateTime(payload.expiresAt);
  const subject = `You're invited to join ${workspaceName} on SaleVision`;

  const text = [
    `Hi,`,
    ``,
    `${inviterName} invited you to join ${workspaceName} as ${role}.`,
    expiresAtLabel ? `This invite expires on ${expiresAtLabel}.` : '',
    `Accept invite: ${inviteLink}`,
    ``,
    `If you weren't expecting this email, you can ignore it.`,
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <p>Hi,</p>
      <p><strong>${esc(inviterName)}</strong> invited you to join <strong>${esc(workspaceName)}</strong> as <strong>${esc(role)}</strong>.</p>
      ${expiresAtLabel ? `<p>This invite expires on <strong>${esc(expiresAtLabel)}</strong>.</p>` : ''}
      <p><a href="${esc(inviteLink)}" style="display:inline-block;padding:10px 16px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:6px">Accept Invite</a></p>
      <p>If the button doesn't work, copy this link:<br/><a href="${esc(inviteLink)}">${esc(inviteLink)}</a></p>
      <p>If you weren't expecting this email, you can ignore it.</p>
    </div>
  `.trim();

  return { subject, text, html };
}

export function buildWelcomeEmail(payload) {
  const userName = String(payload.userName || 'there');
  const workspaceName = String(payload.workspaceName || 'your workspace');
  const subject = `Welcome to ${workspaceName}`;

  const text = [
    `Hi ${userName},`,
    ``,
    `Welcome to ${workspaceName}.`,
    `Your workspace is ready and you can start creating projects, tasks, and invites.`,
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <p>Hi ${esc(userName)},</p>
      <p>Welcome to <strong>${esc(workspaceName)}</strong>.</p>
      <p>Your workspace is ready and you can start creating projects, tasks, and invites.</p>
    </div>
  `.trim();

  return { subject, text, html };
}

export function buildResetPasswordEmail(payload) {
  const userName = String(payload.userName || 'there');
  const resetLink = buildResetPasswordLink(payload.token);
  const expiresAtLabel = formatDateTime(payload.expiresAt);
  const subject = 'Reset your SaleVision password';

  const text = [
    `Hi ${userName},`,
    ``,
    `We received a request to reset your password.`,
    expiresAtLabel ? `This link expires on ${expiresAtLabel}.` : '',
    `Reset password: ${resetLink}`,
    ``,
    `If you did not request this, you can ignore this email.`,
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <p>Hi ${esc(userName)},</p>
      <p>We received a request to reset your password.</p>
      ${expiresAtLabel ? `<p>This link expires on <strong>${esc(expiresAtLabel)}</strong>.</p>` : ''}
      <p><a href="${esc(resetLink)}" style="display:inline-block;padding:10px 16px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:6px">Reset Password</a></p>
      <p>If the button doesn't work, copy this link:<br/><a href="${esc(resetLink)}">${esc(resetLink)}</a></p>
      <p>If you did not request this, you can ignore this email.</p>
    </div>
  `.trim();

  return { subject, text, html };
}
