import { Router } from 'express';
import { authController } from './auth.controller.js';
import { validateRequest } from '../../middlewares/validation.js';
import { buildRateLimiter } from '../../middlewares/rateLimiter.js';
import {
  acceptInviteSchema,
  authRefreshSchema,
  forgotPasswordSchema,
  inviteTokenParamsSchema,
  loginSchema,
  meSessionParamsSchema,
  registerSchema,
  resetPasswordSchema,
  updateMeNotificationsSchema,
  updateMePasswordSchema,
  updateMeProfileSchema,
} from './auth.schemas.js';
import { requireAuth } from '../../middlewares/auth.js';

const router = Router();

router.post('/register', buildRateLimiter({ windowMs: 60 * 1000, max: 10 }), validateRequest(registerSchema), authController.register);
router.post('/login', buildRateLimiter({ windowMs: 60 * 1000, max: 15 }), validateRequest(loginSchema), authController.login);
router.post('/refresh', buildRateLimiter({ windowMs: 60 * 1000, max: 40 }), validateRequest(authRefreshSchema), authController.refresh);
router.post('/logout', buildRateLimiter({ windowMs: 60 * 1000, max: 30 }), authController.logout);
router.post('/forgot-password', buildRateLimiter({ windowMs: 5 * 60 * 1000, max: 5 }), validateRequest(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', buildRateLimiter({ windowMs: 5 * 60 * 1000, max: 10 }), validateRequest(resetPasswordSchema), authController.resetPassword);
router.get('/invite/:token', buildRateLimiter({ windowMs: 60 * 1000, max: 30 }), validateRequest(inviteTokenParamsSchema), authController.getInviteInfo);
router.post('/invite/accept', buildRateLimiter({ windowMs: 60 * 1000, max: 10 }), validateRequest(acceptInviteSchema), authController.acceptInvite);
router.get('/me', requireAuth, authController.me);
router.get('/me/workspace-diagnostics', requireAuth, authController.workspaceDiagnostics);
router.patch('/me/profile', requireAuth, validateRequest(updateMeProfileSchema), authController.updateMeProfile);
router.patch('/me/password', buildRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 }), requireAuth, validateRequest(updateMePasswordSchema), authController.updateMePassword);
router.patch('/me/notifications', requireAuth, validateRequest(updateMeNotificationsSchema), authController.updateMeNotifications);
router.get('/me/sessions', requireAuth, authController.listMeSessions);
router.delete('/me/sessions/:sessionId', requireAuth, validateRequest(meSessionParamsSchema), authController.revokeMeSession);

export const authRoutes = router;
