import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const taskIdParamsSchema = z.object({
  taskId: objectId,
});

export const taskActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
});

export const taskEstimateBodySchema = z.object({
  minutes: z.coerce.number().min(0).max(60 * 24 * 365),
});

export const taskListQuerySchema = z.object({
  status: z.string().trim().min(1).max(60).optional(),
  projectId: objectId.optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assignee: objectId.optional(),
  sprint: objectId.optional(),
  label: objectId.optional(),
  epic: objectId.optional(),
  issueType: z.enum(['epic', 'task', 'subtask']).optional(),
  search: z.string().trim().max(120).optional(),
  dueBefore: z.string().datetime().optional(),
  dueAfter: z.string().datetime().optional(),
  sortBy: z.enum(['dueDate', 'priority', 'createdAt', 'updatedAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const taskBulkBodySchema = z.object({
  taskIds: z.array(objectId).min(1),
  updates: z
    .object({
      status: z.string().trim().min(1).max(60).optional(),
      statusId: objectId.optional(),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      dueDate: z.string().datetime().nullable().optional(),
      assigneeIds: z.array(objectId).optional(),
      primaryAssigneeId: objectId.nullable().optional(),
      issueType: z.enum(['epic', 'task', 'subtask']).optional(),
      externalCollaborators: z
        .array(
          z.object({
            entityType: z.enum(['contact', 'employee']),
            entityId: objectId,
          }),
        )
        .optional(),
    })
    .default({}),
  action: z.enum(['delete']).optional(),
});
