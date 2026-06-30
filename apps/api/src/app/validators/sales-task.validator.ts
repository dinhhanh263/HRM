import { z } from 'zod';
import { SalesTaskType, SalesTaskStatus } from '@prisma/client';

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Tiêu đề là bắt buộc').max(200),
  type: z.nativeEnum(SalesTaskType).optional(),
  customerId: z.string().cuid(),
  dealId: z.string().cuid().optional().nullable(),
  assigneeId: z.string().cuid().optional(),
  dueAt: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  type: z.nativeEnum(SalesTaskType),
  dueAt: z.string(),
  status: z.nativeEnum(SalesTaskStatus),
}).partial();

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
