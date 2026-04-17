import { z } from 'zod';

const role = z.enum(['owner', 'admin', 'member', 'viewer']);

export const workspaceParamsSchema = z.object({
  params: z.object({
    workspaceId: z.string().min(2).max(100),
  }),
});

export const memberParamsSchema = z.object({
  params: z.object({
    workspaceId: z.string().min(2).max(100),
    userId: z.string().min(12).max(100),
  }),
});

export const createWorkspaceSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,64}$/).optional(),
    timezone: z.string().trim().min(2).max(64).optional(),
    logo: z.string().trim().max(1000).optional(),
  }),
});

export const updateWorkspaceSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,64}$/).optional(),
    timezone: z.string().trim().min(2).max(64).optional(),
    logo: z.string().trim().max(1000).optional(),
  }),
});

export const inviteMemberSchema = z.object({
  body: z.object({
    email: z.string().trim().email().max(180).transform((value) => value.toLowerCase()),
    role: role.default('member'),
  }),
});

export const updateMemberRoleSchema = z.object({
  body: z.object({
    role,
  }),
});

export const listAuditLogQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    actor: z.string().trim().optional(),
    action: z.string().trim().optional(),
    resource: z.string().trim().optional(),
  }),
});

export const listActivityQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    entity: z.string().trim().optional(),
    entityId: z.string().trim().optional(),
    actor: z.string().trim().optional(),
  }),
});

