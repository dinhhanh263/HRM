import { z } from 'zod';

// SPEC-048: validate fund-account create/update. `currentBalance` is never accepted
// from the client — it is always derived (openingBalance + Σ actual IN − Σ actual OUT).
const fundAccountType = z.enum(['BANK', 'CASH', 'EWALLET']);

export const createFundAccountSchema = z.object({
  issuingEntityId: z.string().min(1, 'Pháp nhân là bắt buộc'),
  name: z.string().trim().min(1, 'Tên tài khoản là bắt buộc').max(200),
  type: fundAccountType,
  currency: z.string().trim().min(1).max(8).optional(),
  openingBalance: z.number().nonnegative().optional(),
});

export const updateFundAccountSchema = z
  .object({
    name: z.string().trim().min(1, 'Tên tài khoản là bắt buộc').max(200),
    type: fundAccountType,
    currency: z.string().trim().min(1).max(8),
    openingBalance: z.number().nonnegative(),
    active: z.boolean(),
  })
  .partial();

export const fundAccountListQuerySchema = z.object({
  issuingEntityId: z.string().optional(),
  active: z.coerce.boolean().optional(),
});

export type CreateFundAccountInput = z.infer<typeof createFundAccountSchema>;
export type UpdateFundAccountInput = z.infer<typeof updateFundAccountSchema>;
