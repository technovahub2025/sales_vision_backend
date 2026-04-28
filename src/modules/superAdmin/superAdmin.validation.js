import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const role = z.enum(['owner', 'admin', 'member', 'viewer']);

export const listSuperAdminWorkspacesSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().max(120).optional(),
  }),
});

export const listSuperAdminWorkspaceHealthSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().trim().max(120).optional(),
    health: z.enum(['healthy', 'needs_owner', 'overdue_risk', 'inactive', 'invite_pending']).optional(),
  }),
});

export const listSuperAdminActivitySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    workspaceId: objectId.optional(),
    module: z.string().trim().max(80).optional(),
    action: z.string().trim().max(80).optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
  }),
});

export const superAdminSecuritySchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
  }),
});

export const workspaceUsersParamsSchema = z.object({
  params: z.object({
    workspaceId: objectId,
  }),
});

export const listWorkspaceUsersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().trim().max(120).optional(),
  }),
});

export const listSuperAdminUsersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().trim().max(120).optional(),
    workspaceId: objectId.optional(),
    role: z.enum(['owner', 'admin', 'member', 'viewer']).optional(),
    status: z.enum(['active', 'pending', 'inactive']).optional(),
  }),
});

export const updateWorkspaceUserRoleSchema = z.object({
  params: z.object({
    workspaceId: objectId,
    userId: objectId,
  }),
  body: z.object({
    role,
  }),
});

export const updateWorkspacePlanSchema = z.object({
  params: z.object({
    workspaceId: objectId,
  }),
  body: z.object({
    plan: z.enum(['free', 'pro']),
  }),
});

export const removeWorkspaceUserSchema = z.object({
  params: z.object({
    workspaceId: objectId,
    userId: objectId,
  }),
});

export const bulkRemoveSuperAdminUsersSchema = z.object({
  body: z.object({
    users: z
      .array(
        z.object({
          workspaceId: objectId,
          userId: objectId,
        }),
      )
      .min(1)
      .max(100),
  }),
});
