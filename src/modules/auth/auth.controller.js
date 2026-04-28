import { ok } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { authService } from './auth.service.js';

export const authController = {
  register: asyncHandler(async (req, res) => {
    const data = await authService.register({ body: req.body, req, res });
    return res.status(201).json(ok(data, 'Registered successfully'));
  }),

  login: asyncHandler(async (req, res) => {
    const data = await authService.login({ body: req.body, req, res });
    return res.status(200).json(ok(data, 'Logged in successfully'));
  }),

  refresh: asyncHandler(async (req, res) => {
    const data = await authService.refresh({ req, res });
    return res.status(200).json(ok(data, 'Session refreshed'));
  }),

  logout: asyncHandler(async (req, res) => {
    const data = await authService.logout({ req, res });
    return res.status(200).json(ok(data, 'Logged out successfully'));
  }),

  forgotPassword: asyncHandler(async (req, res) => {
    const data = await authService.forgotPassword({ body: req.body });
    return res.status(200).json(ok(data, 'If that account exists, a reset email has been sent'));
  }),

  resetPassword: asyncHandler(async (req, res) => {
    const data = await authService.resetPassword({ body: req.body });
    return res.status(200).json(ok(data, 'Password has been reset'));
  }),

  me: asyncHandler(async (req, res) => {
    const data = await authService.me({ userId: req.auth.userId, auth: req.auth });
    return res.status(200).json(ok(data));
  }),

  workspaceDiagnostics: asyncHandler(async (req, res) => {
    const data = await authService.workspaceDiagnostics({ userId: req.auth.userId });
    return res.status(200).json(ok(data));
  }),

  getInviteInfo: asyncHandler(async (req, res) => {
    const data = await authService.getInviteInfo({ token: req.params.token });
    return res.status(200).json(ok(data));
  }),

  acceptInvite: asyncHandler(async (req, res) => {
    const data = await authService.acceptInvite({ body: req.body, req, res });
    return res.status(200).json(ok(data, 'Invite accepted'));
  }),

  updateMeProfile: asyncHandler(async (req, res) => {
    const data = await authService.updateMeProfile({ userId: req.auth.userId, body: req.body });
    return res.status(200).json(ok(data, 'Profile updated'));
  }),

  updateMePassword: asyncHandler(async (req, res) => {
    const data = await authService.updateMePassword({ userId: req.auth.userId, body: req.body });
    return res.status(200).json(ok(data, 'Password updated'));
  }),

  updateMeNotifications: asyncHandler(async (req, res) => {
    const data = await authService.updateMeNotifications({ userId: req.auth.userId, body: req.body });
    return res.status(200).json(ok(data, 'Notification preferences updated'));
  }),

  listMeSessions: asyncHandler(async (req, res) => {
    const data = await authService.listMeSessions({ req, userId: req.auth.userId });
    return res.status(200).json(ok(data));
  }),

  revokeMeSession: asyncHandler(async (req, res) => {
    const data = await authService.revokeMeSession({ userId: req.auth.userId, sessionId: req.params.sessionId });
    return res.status(200).json(ok(data, 'Session revoked'));
  }),
};
