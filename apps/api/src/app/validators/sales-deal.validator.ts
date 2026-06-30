import { z } from 'zod';
import { DealStatus } from '@prisma/client';

export const createDealSchema = z.object({
  title: z.string().trim().min(1, 'Tên cơ hội là bắt buộc').max(200),
  customerId: z.string().cuid(),
  pipelineId: z.string().cuid(),
  currentStageId: z.string().cuid().optional(),
  ownerId: z.string().cuid().optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  expectedCloseDate: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

export const updateDealSchema = z.object({
  title: z.string().trim().min(1).max(200),
  ownerId: z.string().cuid(),
  currency: z.string().trim().min(1).max(8),
  expectedCloseDate: z.string().nullable(),
}).partial();

export const listDealsQuerySchema = z.object({
  pipelineId: z.string().cuid().optional(),
  status: z.nativeEnum(DealStatus).optional(),
  search: z.string().trim().max(200).optional(),
});

export const moveDealSchema = z.object({
  toStageId: z.string().cuid(),
  note: z.string().trim().max(500).optional(),
});

export const loseDealSchema = z.object({
  lostReason: z.string().trim().min(1, 'Cần nhập lý do thua').max(500),
});

export type CreateDealInput = z.infer<typeof createDealSchema>;
export type UpdateDealInput = z.infer<typeof updateDealSchema>;
