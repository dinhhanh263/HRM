import { z } from 'zod';

const direction = z.enum(['IN', 'OUT']);
const status = z.enum(['ACTUAL', 'PLANNED']);

// SPEC-048: validate cash-transaction create/update/list. `amount` must be > 0;
// direction/status are enums; `occurredAt` an ISO date string.
export const createCashTransactionSchema = z.object({
  accountId: z.string().min(1, 'Tài khoản là bắt buộc'),
  direction,
  status: status.optional(),
  amount: z.number().positive('Số tiền phải lớn hơn 0'),
  occurredAt: z.string().min(1, 'Ngày giao dịch là bắt buộc'),
  categoryId: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  reference: z.string().max(120).optional().nullable(),
});

export const updateCashTransactionSchema = z
  .object({
    accountId: z.string().min(1),
    direction,
    status,
    amount: z.number().positive('Số tiền phải lớn hơn 0'),
    occurredAt: z.string().min(1),
    categoryId: z.string().nullable(),
    departmentId: z.string().nullable(),
    description: z.string().max(1000).nullable(),
    reference: z.string().max(120).nullable(),
  })
  .partial();

export const cashTransactionListQuerySchema = z.object({
  issuingEntityId: z.string().optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  departmentId: z.string().optional(),
  direction: direction.optional(),
  status: status.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type CreateCashTransactionInput = z.infer<typeof createCashTransactionSchema>;
export type UpdateCashTransactionInput = z.infer<typeof updateCashTransactionSchema>;
export type CashTransactionListInput = z.infer<typeof cashTransactionListQuerySchema>;
