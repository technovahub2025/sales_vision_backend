import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const notificationsListQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  read: z.coerce.boolean().optional(),
  isRead: z.coerce.boolean().optional(),
  type: z
    .enum([
      'task_assigned',
      'task_due_soon',
      'mention',
      'comment',
      'lead_assigned',
      'sprint_started',
      'approval_needed',
    ])
    .optional(),
});

export const notificationIdParamsSchema = z.object({
  id: objectId,
});

export const notificationsReadAllBodySchema = z.object({}).passthrough();
