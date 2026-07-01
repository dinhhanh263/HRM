import { z } from 'zod';

// SPEC-048 GĐ2: validate spending-plan payloads. `period` is "YYYY-MM";
// each item needs a title + amount > 0.
const periodSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Kỳ phải có dạng YYYY-MM');

const itemSchema = z.object({
  categoryId: z.string().optional().nullable(),
  title: z.string().trim().min(1, 'Tên khoản chi là bắt buộc').max(200),
  amount: z.number().positive('Số tiền phải lớn hơn 0'),
  expectedDate: z.string().optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});

export const createSpendingPlanSchema = z.object({
  departmentId: z.string().optional().nullable(), // tùy chọn; mặc định phòng người tạo
  issuingEntityId: z.string().min(1, 'Pháp nhân là bắt buộc'),
  period: periodSchema,
  items: z.array(itemSchema).min(1, 'Cần ít nhất một khoản chi'),
});

export const updateSpendingPlanSchema = z
  .object({
    period: periodSchema,
    issuingEntityId: z.string().min(1),
    items: z.array(itemSchema).min(1, 'Cần ít nhất một khoản chi'),
  })
  .partial();

export const reviewSpendingPlanSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(1000).optional().nullable(),
});

export const spendingPlanListQuerySchema = z.object({
  scope: z.enum(['mine', 'all']).optional(),
  period: z.string().optional(),
  departmentId: z.string().optional(),
  issuingEntityId: z.string().optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED']).optional(),
});

export type CreateSpendingPlanInput = z.infer<typeof createSpendingPlanSchema>;
export type UpdateSpendingPlanInput = z.infer<typeof updateSpendingPlanSchema>;
export type SpendingPlanListInput = z.infer<typeof spendingPlanListQuerySchema>;
