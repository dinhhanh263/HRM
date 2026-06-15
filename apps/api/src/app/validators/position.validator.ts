import { z } from 'zod';

export const createPositionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  departmentId: z.string().cuid().optional(),
  level: z.number().int().min(1).max(5).optional(),
});

export const updatePositionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  departmentId: z.string().cuid().optional().nullable(),
  level: z.number().int().min(1).max(5).optional(),
});

export type CreatePositionInput = z.infer<typeof createPositionSchema>;
export type UpdatePositionInput = z.infer<typeof updatePositionSchema>;
