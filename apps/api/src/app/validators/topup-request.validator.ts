import { z } from 'zod';

// SPEC-048 GĐ3: validate top-up request payloads.
export const createTopUpRequestSchema = z.object({
  issuingEntityId: z.string().min(1, 'Pháp nhân là bắt buộc'),
  title: z.string().trim().min(1, 'Tiêu đề là bắt buộc').max(200),
  amount: z.number().positive('Số tiền phải lớn hơn 0'),
  currency: z.string().trim().min(1).max(8).optional(),
  neededByDate: z.string().optional().nullable(),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Kỳ phải có dạng YYYY-MM').optional().nullable(),
  justification: z.string().trim().min(1, 'Cần nêu giải trình').max(5000),
});

export const reviewTopUpRequestSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(2000).optional().nullable(),
  fundedAccountId: z.string().optional().nullable(),
});

export const topUpRequestListQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  issuingEntityId: z.string().optional(),
});

export type CreateTopUpRequestInput = z.infer<typeof createTopUpRequestSchema>;
export type ReviewTopUpRequestInput = z.infer<typeof reviewTopUpRequestSchema>;
export type TopUpRequestListInput = z.infer<typeof topUpRequestListQuerySchema>;
