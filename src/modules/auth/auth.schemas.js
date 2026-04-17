import { z } from 'zod';

const email = z.string().trim().email().max(180).transform((v) => v.toLowerCase());
const password = z.string().min(8).max(128).regex(/[A-Z]/, 'Must include uppercase').regex(/[a-z]/, 'Must include lowercase').regex(/[0-9]/, 'Must include number');

export const registerSchema = z.object({
  body: z.object({
    displayName: z.string().trim().min(2).max(80),
    email,
    password,
    workspaceName: z.string().trim().min(2).max(120),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email,
    password: z.string().min(1).max(128),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({ email }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(20).max(256),
    newPassword: password,
  }),
});

export const acceptInviteSchema = z.object({
  body: z.object({
    token: z.string().min(20).max(256),
    displayName: z.string().trim().min(2).max(80).optional(),
    password: password.optional(),
  }),
});

export const inviteTokenParamsSchema = z.object({
  params: z.object({
    token: z.string().min(20).max(256),
  }),
});

export const authRefreshSchema = z.object({
  body: z.object({}).optional(),
});

export const updateMeProfileSchema = z.object({
  body: z.object({
    displayName: z.string().trim().min(2).max(80).optional(),
    avatarUrl: z.string().trim().url().max(1000).optional(),
    email: email.optional(),
  }),
});

export const updateMePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: password,
  }),
});

export const updateMeNotificationsSchema = z.object({
  body: z.object({
    preferences: z.record(z.string(), z.boolean()),
  }),
});

export const meSessionParamsSchema = z.object({
  params: z.object({
    sessionId: z.string().min(4).max(128),
  }),
});
