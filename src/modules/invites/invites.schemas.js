import { z } from 'zod';

export const createInviteSchema = {
  body: z.object({
    email: z.string().trim().email().max(180).transform((value) => value.toLowerCase()),
    role: z.enum(['admin', 'member', 'viewer']).default('member'),
  }),
};

export const listInvitesSchema = {
  query: z.object({
    status: z.enum(['pending', 'accepted', 'revoked', 'expired']).optional(),
    role: z.enum(['admin', 'member', 'viewer']).optional(),
    search: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  }),
};
