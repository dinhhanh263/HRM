import { z } from 'zod';
import { SalesStageType } from '@prisma/client';

export const createStageSchema = z.object({
  name: z.string().trim().min(1, 'Tên giai đoạn là bắt buộc').max(80),
  type: z.nativeEnum(SalesStageType),
  probability: z.coerce.number().int().min(0).max(100).default(0),
});

export const updateStageSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    type: z.nativeEnum(SalesStageType),
    probability: z.coerce.number().int().min(0).max(100),
  })
  .partial();

export const reorderStagesSchema = z.object({
  orderedIds: z.array(z.string().cuid()).min(1),
});

export type CreateStageInput = z.infer<typeof createStageSchema>;
export type UpdateStageInput = z.infer<typeof updateStageSchema>;
