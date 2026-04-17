import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { User } from '../../models/user.model.js';
import { Workspace } from '../../models/workspace.model.js';
import { WorkspaceMember } from '../../models/workspaceMember.model.js';
import { WorkspaceInvite } from '../../models/workspaceInvite.model.js';
import { RefreshToken } from '../../models/refreshToken.model.js';
import { PasswordResetToken } from '../../models/passwordResetToken.model.js';
import { Label } from '../../models/label.model.js';
import { SettingPreference } from '../../models/settingPreference.model.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getRefreshCookieName,
  getAccessCookieName,
  cookieOptions,
} from '../../config/jwt.js';
import { randomId, randomToken, sha256 } from '../../utils/crypto.js';
import { normalizeRole } from '../../utils/roles.js';
import { classifyWorkspaceIntegrity } from '../../services/workspaceIntegrity.service.js';
import { workflowService } from '../workflow/workflow.service.js';
import { queueResetPasswordEmail, queueWelcomeEmail } from './auth.mailer.js';

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function uniqueWorkspaceSlug(name) {
  const base = slugify(name) || 'workspace';
  for (let i = 0; i < 100; i += 1) {
    const suffix = i === 0 ? '' : `-${i + 1}`;
    const slug = `${base}${suffix}`;
    const exists = await Workspace.findOne({ slug }, { _id: 1 }).lean();
    if (!exists) return slug;
  }
  return `${base}-${Date.now()}`;
}

function refreshExpiryDate() {
  const days = Number(process.env.JWT_REFRESH_DAYS || 7);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function accessCookieMaxAgeMs() {
  return 15 * 60 * 1000;
}

function refreshCookieMaxAgeMs() {
  const days = Number(process.env.JWT_REFRESH_DAYS || 7);
  return days * 24 * 60 * 60 * 1000;
}

/**
 * @param {{ userId: string, workspaceId: string, email: string, role: string, ipAddress?: string, userAgent?: string }} params
 */
async function issueAuthTokens(params) {
  const tokenFamily = randomId(16);
  const sessionId = randomId(12);
  const accessToken = signAccessToken({
    userId: params.userId,
    workspaceId: params.workspaceId,
    email: params.email,
    role: params.role,
  });
  const refreshToken = signRefreshToken({
    userId: params.userId,
    tokenFamily,
    sessionId,
  });

  await RefreshToken.create({
    workspaceId: new Types.ObjectId(params.workspaceId),
    userId: new Types.ObjectId(params.userId),
    tokenHash: sha256(refreshToken),
    familyId: tokenFamily,
    sessionId,
    expiresAt: refreshExpiryDate(),
    ipAddress: params.ipAddress || '',
    userAgent: params.userAgent || '',
  });

  return { accessToken, refreshToken };
}

async function seedWorkspaceDefaults(workspaceId) {
  await workflowService.ensureDefaultTaskWorkflow(workspaceId);
  const defaults = [
    { name: 'Bug', color: '#EF4444' },
    { name: 'Feature', color: '#2563EB' },
    { name: 'Enhancement', color: '#7C3AED' },
  ];

  for (const label of defaults) {
    await Label.updateOne(
      { workspaceId, name: label.name },
      { $setOnInsert: { workspaceId, ...label } },
      { upsert: true },
    );
  }
}

/**
 * Repairs legacy user/workspace links so workspace-scoped APIs always have a valid membership context.
 * @param {{ _id: import('mongoose').Types.ObjectId|string, workspaceId?: import('mongoose').Types.ObjectId|string, role?: string, email?: string }} user
 */
async function ensureWorkspaceIntegrity(user) {
  const workspaceId = String(user?.workspaceId || '');
  const userId = String(user?._id || '');
  if (!workspaceId || !userId || !Types.ObjectId.isValid(workspaceId) || !Types.ObjectId.isValid(userId)) {
    return;
  }

  const workspace = await Workspace.findById(workspaceId, { _id: 1, ownerId: 1 }).lean();
  if (!workspace) {
    return;
  }

  const userObjectId = new Types.ObjectId(userId);
  const activeMembership = await WorkspaceMember.findOne(
    { workspaceId: workspace._id, userId: userObjectId, status: 'active' },
    { _id: 1 },
  ).lean();

  if (!activeMembership) {
    await WorkspaceMember.updateOne(
      { workspaceId: workspace._id, userId: userObjectId },
      {
        $set: {
          role: normalizeRole(user?.role),
          status: 'active',
        },
        $setOnInsert: {
          joinedAt: new Date(),
          invitedEmail: String(user?.email || ''),
        },
      },
      { upsert: true },
    );
  }

  if (normalizeRole(user?.role) === 'owner' && !workspace.ownerId) {
    await Workspace.updateOne({ _id: workspace._id }, { $set: { ownerId: userObjectId } });
  }
}

/** @param {import('express').Request} req */
function clientMeta(req) {
  return {
    ipAddress: req.ip || req.headers['x-forwarded-for']?.toString()?.split(',')?.[0] || '',
    userAgent: req.headers['user-agent'] || '',
  };
}

/** @param {{res: import('express').Response, accessToken: string, refreshToken: string}} params */
function writeAuthCookies({ res, accessToken, refreshToken }) {
  res.cookie(getAccessCookieName(), accessToken, cookieOptions(accessCookieMaxAgeMs()));
  res.cookie(getRefreshCookieName(), refreshToken, cookieOptions(refreshCookieMaxAgeMs()));
}

/** @param {string} token */
async function resolvePendingInvite(token) {
  const tokenHash = sha256(token);
  const invite = await WorkspaceInvite.findOne(
    {
      tokenHash,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    },
    {
      _id: 1,
      workspaceId: 1,
      email: 1,
      role: 1,
      invitedByUserId: 1,
      expiresAt: 1,
      status: 1,
    },
  ).lean();

  if (!invite) {
    const error = new Error('Invite is invalid or expired');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  return invite;
}

/**
 * @param {{ body: {displayName: string, email: string, password: string, workspaceName: string}, req: import('express').Request, res: import('express').Response }} params
 */
async function register({ body, req, res }) {
  const workspace = await Workspace.create({
    name: body.workspaceName,
    slug: await uniqueWorkspaceSlug(body.workspaceName),
  });

  const existing = await User.findOne({ workspaceId: workspace._id, email: body.email }, { _id: 1 }).lean();
  if (existing) {
    const error = new Error('Email is already registered in this workspace');
    error.statusCode = 409;
    error.code = 'CONFLICT';
    throw error;
  }

  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await User.create({
    workspaceId: workspace._id,
    displayName: body.displayName,
    email: body.email,
    passwordHash,
    role: 'owner',
  });

  await Workspace.updateOne({ _id: workspace._id }, { $set: { ownerId: user._id } });

  await WorkspaceMember.updateOne(
    { workspaceId: workspace._id, userId: user._id },
    {
      $set: {
        role: 'owner',
        status: 'active',
      },
      $setOnInsert: {
        joinedAt: new Date(),
        invitedEmail: user.email,
      },
    },
    { upsert: true },
  );

  await seedWorkspaceDefaults(workspace._id);

  const { accessToken, refreshToken } = await issueAuthTokens({
    userId: String(user._id),
    workspaceId: String(workspace._id),
    email: user.email,
    role: user.role,
    ...clientMeta(req),
  });

  writeAuthCookies({ res, accessToken, refreshToken });

  queueWelcomeEmail({
    to: user.email,
    userName: user.displayName,
    workspaceName: workspace.name,
  });

  return {
    accessToken,
    user: {
      id: String(user._id),
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      workspaceId: String(workspace._id),
    },
    workspace: {
      id: String(workspace._id),
      name: workspace.name,
      slug: workspace.slug,
    },
  };
}

/**
 * @param {{ body: {email: string, password: string}, req: import('express').Request, res: import('express').Response }} params
 */
async function login({ body, req, res }) {
  const user = await User.findOne(
    { email: body.email, isActive: true },
    { workspaceId: 1, displayName: 1, email: 1, role: 1, passwordHash: 1 },
  ).select('+passwordHash');

  if (!user) {
    const error = new Error('Invalid credentials');
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  const valid = await bcrypt.compare(body.password, user.passwordHash);
  if (!valid) {
    const error = new Error('Invalid credentials');
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  await ensureWorkspaceIntegrity(user);

  const { accessToken, refreshToken } = await issueAuthTokens({
    userId: String(user._id),
    workspaceId: String(user.workspaceId),
    email: user.email,
    role: user.role,
    ...clientMeta(req),
  });

  writeAuthCookies({ res, accessToken, refreshToken });

  return {
    accessToken,
    user: {
      id: String(user._id),
      workspaceId: String(user.workspaceId),
      displayName: user.displayName,
      email: user.email,
      role: user.role,
    },
  };
}

/**
 * @param {{ req: import('express').Request, res: import('express').Response }} params
 */
async function refresh({ req, res }) {
  const token = req.cookies?.[getRefreshCookieName()];
  if (!token) {
    const error = new Error('Missing refresh token');
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    const error = new Error('Invalid refresh token');
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  const existing = await RefreshToken.findOne(
    {
      tokenHash: sha256(token),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { _id: 1, workspaceId: 1, userId: 1, familyId: 1, sessionId: 1 },
  ).lean();

  if (!existing) {
    await RefreshToken.updateMany(
      { familyId: String(decoded.tokenFamily), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    const error = new Error('Invalid refresh token');
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  const user = await User.findOne(
    { _id: existing.userId, isActive: true },
    { workspaceId: 1, displayName: 1, email: 1, role: 1 },
  ).lean();

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  const accessToken = signAccessToken({
    userId: String(user._id),
    workspaceId: String(user.workspaceId),
    email: user.email,
    role: user.role,
  });

  const nextRefreshToken = signRefreshToken({
    userId: String(user._id),
    tokenFamily: String(existing.familyId),
    sessionId: String(existing.sessionId),
  });

  await RefreshToken.updateOne(
    { _id: existing._id },
    { $set: { revokedAt: new Date(), replacedByTokenHash: sha256(nextRefreshToken) } },
  );

  await RefreshToken.create({
    workspaceId: existing.workspaceId,
    userId: existing.userId,
    tokenHash: sha256(nextRefreshToken),
    familyId: existing.familyId,
    sessionId: existing.sessionId,
    expiresAt: refreshExpiryDate(),
    ...clientMeta(req),
  });

  writeAuthCookies({ res, accessToken, refreshToken: nextRefreshToken });

  return {
    accessToken,
    user: {
      id: String(user._id),
      workspaceId: String(user.workspaceId),
      displayName: user.displayName,
      email: user.email,
      role: user.role,
    },
  };
}

/** @param {{ req: import('express').Request, res: import('express').Response }} params */
async function logout({ req, res }) {
  const token = req.cookies?.[getRefreshCookieName()];
  if (token) {
    await RefreshToken.updateOne(
      { tokenHash: sha256(token), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }

  res.clearCookie(getAccessCookieName(), cookieOptions(0));
  res.clearCookie(getRefreshCookieName(), cookieOptions(0));
  return { loggedOut: true };
}

/** @param {{ body: { email: string } }} params */
async function forgotPassword({ body }) {
  const user = await User.findOne({ email: body.email, isActive: true }, { _id: 1, email: 1, displayName: 1, workspaceId: 1 }).lean();
  if (!user) {
    return { accepted: true };
  }

  const rawToken = randomToken(32);
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await PasswordResetToken.updateMany(
    { userId: user._id, usedAt: null },
    { $set: { usedAt: new Date() } },
  );

  await PasswordResetToken.create({
    workspaceId: user.workspaceId,
    userId: user._id,
    tokenHash,
    expiresAt,
  });

  queueResetPasswordEmail({
    to: user.email,
    userName: user.displayName,
    token: rawToken,
    expiresAt: expiresAt.toISOString(),
  });

  return { accepted: true };
}

/** @param {{ body: { token: string, newPassword: string } }} params */
async function resetPassword({ body }) {
  const tokenHash = sha256(body.token);

  const reset = await PasswordResetToken.findOne(
    { tokenHash, usedAt: null, expiresAt: { $gt: new Date() } },
    { _id: 1, userId: 1 },
  ).lean();

  if (!reset) {
    const error = new Error('Reset token is invalid or expired');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const passwordHash = await bcrypt.hash(body.newPassword, 12);

  await User.updateOne({ _id: reset.userId }, { $set: { passwordHash } });
  await PasswordResetToken.updateOne({ _id: reset._id }, { $set: { usedAt: new Date() } });
  await RefreshToken.updateMany({ userId: reset.userId, revokedAt: null }, { $set: { revokedAt: new Date() } });

  return { reset: true };
}

/** @param {{ token: string }} params */
async function getInviteInfo({ token }) {
  const invite = await resolvePendingInvite(token);
  const [workspace, inviter] = await Promise.all([
    Workspace.findById(invite.workspaceId, { _id: 1, name: 1, slug: 1 }).lean(),
    User.findById(invite.invitedByUserId, { _id: 1, displayName: 1, email: 1 }).lean(),
  ]);

  return {
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
    workspace: workspace
      ? {
          id: String(workspace._id),
          name: workspace.name,
          slug: workspace.slug,
        }
      : null,
    inviter: inviter
      ? {
          id: String(inviter._id),
          displayName: inviter.displayName,
          email: inviter.email,
        }
      : null,
  };
}

/** @param {{ body: { token: string, displayName?: string, password?: string }, req: import('express').Request, res: import('express').Response }} params */
async function acceptInvite({ body, req, res }) {
  const invite = await resolvePendingInvite(body.token);

  const workspace = await Workspace.findById(invite.workspaceId, { _id: 1, name: 1, slug: 1 }).lean();
  if (!workspace) {
    const error = new Error('Workspace not found');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  let user = await User.findOne(
    { workspaceId: invite.workspaceId, email: invite.email },
    { _id: 1, workspaceId: 1, displayName: 1, email: 1, role: 1, isActive: 1 },
  ).lean();

  if (!user) {
    if (!body.displayName || !body.password) {
      const error = new Error('displayName and password are required for first-time invite acceptance');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const created = await User.create({
      workspaceId: invite.workspaceId,
      displayName: body.displayName,
      email: invite.email,
      passwordHash,
      role: invite.role,
      isActive: true,
    });

    user = {
      _id: created._id,
      workspaceId: created.workspaceId,
      displayName: created.displayName,
      email: created.email,
      role: created.role,
      isActive: created.isActive,
    };
  }

  await WorkspaceMember.updateOne(
    { workspaceId: invite.workspaceId, userId: user._id },
    {
      $set: {
        workspaceId: invite.workspaceId,
        userId: user._id,
        role: invite.role,
        status: 'active',
        joinedAt: new Date(),
      },
      $setOnInsert: {
        invitedBy: invite.invitedByUserId,
        invitedEmail: invite.email,
      },
    },
    { upsert: true },
  );

  await WorkspaceInvite.updateOne(
    { _id: invite._id },
    {
      $set: {
        status: 'accepted',
        acceptedAt: new Date(),
        acceptedByUserId: user._id,
      },
    },
  );

  const { accessToken, refreshToken } = await issueAuthTokens({
    userId: String(user._id),
    workspaceId: String(invite.workspaceId),
    email: user.email,
    role: invite.role,
    ...clientMeta(req),
  });

  writeAuthCookies({ res, accessToken, refreshToken });

  return {
    accessToken,
    user: {
      id: String(user._id),
      workspaceId: String(invite.workspaceId),
      displayName: user.displayName,
      email: user.email,
      role: invite.role,
    },
    workspace: {
      id: String(workspace._id),
      name: workspace.name,
      slug: workspace.slug,
    },
  };
}

/** @param {{ userId: string }} params */
async function me({ userId }) {
  const user = await User.findById(userId, { workspaceId: 1, displayName: 1, email: 1, role: 1, avatarUrl: 1 }).lean();
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  await ensureWorkspaceIntegrity(user);

  const memberships = await WorkspaceMember.find(
    { userId: user._id, status: 'active' },
    { workspaceId: 1, role: 1, status: 1, joinedAt: 1 },
  ).limit(100).lean();

  const workspaceIds = memberships.map((item) => item.workspaceId);
  const workspaces = await Workspace.find(
    { _id: { $in: workspaceIds } },
    { name: 1, slug: 1 },
  ).limit(100).lean();

  const byId = new Map(workspaces.map((item) => [String(item._id), item]));

  return {
    user: {
      id: String(user._id),
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl,
      workspaceId: String(user.workspaceId),
    },
    memberships: memberships.map((item) => ({
      workspaceId: String(item.workspaceId),
      role: item.role,
      status: item.status,
      joinedAt: item.joinedAt,
      workspace: byId.get(String(item.workspaceId)) || null,
    })),
  };
}

/** @param {{ userId: string }} params */
async function workspaceDiagnostics({ userId }) {
  const diagnostic = await classifyWorkspaceIntegrity(userId);
  return {
    ...diagnostic,
    at: new Date().toISOString(),
  };
}

/** @param {{ userId: string, body: { displayName?: string, avatarUrl?: string, email?: string } }} params */
async function updateMeProfile({ userId, body }) {
  const user = await User.findById(userId, { _id: 1, workspaceId: 1, email: 1 }).lean();
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  const update = {};
  if (body.displayName) update.displayName = body.displayName;
  if (body.avatarUrl !== undefined) update.avatarUrl = body.avatarUrl;
  if (body.email) {
    const existing = await User.findOne(
      { workspaceId: user.workspaceId, email: body.email, _id: { $ne: user._id } },
      { _id: 1 },
    ).lean();
    if (existing) {
      const error = new Error('Email already in use');
      error.statusCode = 409;
      error.code = 'CONFLICT';
      throw error;
    }
    update.email = body.email;
  }

  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: update },
    { new: true, projection: { _id: 1, workspaceId: 1, displayName: 1, email: 1, role: 1, avatarUrl: 1 } },
  ).lean();

  return {
    id: String(updated._id),
    workspaceId: String(updated.workspaceId),
    displayName: updated.displayName,
    email: updated.email,
    role: updated.role,
    avatarUrl: updated.avatarUrl || '',
  };
}

/** @param {{ userId: string, body: { currentPassword: string, newPassword: string } }} params */
async function updateMePassword({ userId, body }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
  if (!valid) {
    const error = new Error('Current password is incorrect');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const passwordHash = await bcrypt.hash(body.newPassword, 12);
  user.passwordHash = passwordHash;
  await user.save();

  await RefreshToken.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  return { updated: true };
}

/** @param {{ userId: string, body: { preferences: Record<string, boolean> } }} params */
async function updateMeNotifications({ userId, body }) {
  const user = await User.findById(userId, { _id: 1, workspaceId: 1 }).lean();
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  const nextNotifications = body.preferences || {};
  const preference = await SettingPreference.findOneAndUpdate(
    { workspaceId: user.workspaceId },
    { $set: { notifications: nextNotifications } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return {
    workspaceId: String(user.workspaceId),
    notifications: preference?.notifications || {},
  };
}

/** @param {{ req: import('express').Request, userId: string }} params */
async function listMeSessions({ req, userId }) {
  const user = await User.findById(userId, { _id: 1, workspaceId: 1 }).lean();
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  const currentToken = req.cookies?.[getRefreshCookieName()] || '';
  let currentSessionId = '';
  if (currentToken) {
    try {
      const decoded = verifyRefreshToken(currentToken);
      currentSessionId = String(decoded.sessionId || '');
    } catch {
      currentSessionId = '';
    }
  }

  const tokens = await RefreshToken.find(
    {
      userId: user._id,
      workspaceId: user.workspaceId,
      expiresAt: { $gt: new Date() },
    },
    { sessionId: 1, createdAt: 1, revokedAt: 1, userAgent: 1, ipAddress: 1, expiresAt: 1 },
  )
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  /** @type {Map<string, any>} */
  const bySession = new Map();
  for (const token of tokens) {
    const key = String(token.sessionId || '');
    if (!key || bySession.has(key)) continue;
    bySession.set(key, token);
  }

  return Array.from(bySession.entries()).map(([sessionId, token]) => ({
    id: sessionId,
    sessionId,
    userAgent: token.userAgent || '',
    ipAddress: token.ipAddress || '',
    createdAt: token.createdAt,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    isCurrent: currentSessionId && sessionId === currentSessionId,
    revoked: Boolean(token.revokedAt),
  }));
}

/** @param {{ userId: string, sessionId: string }} params */
async function revokeMeSession({ userId, sessionId }) {
  const user = await User.findById(userId, { _id: 1, workspaceId: 1 }).lean();
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  const result = await RefreshToken.updateMany(
    {
      userId: user._id,
      workspaceId: user.workspaceId,
      sessionId: String(sessionId),
      revokedAt: null,
    },
    { $set: { revokedAt: new Date() } },
  );

  return { sessionId: String(sessionId), revoked: result.modifiedCount > 0 };
}

export const authService = {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  getInviteInfo,
  acceptInvite,
  me,
  workspaceDiagnostics,
  updateMeProfile,
  updateMePassword,
  updateMeNotifications,
  listMeSessions,
  revokeMeSession,
};
