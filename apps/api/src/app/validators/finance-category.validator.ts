import { z } from 'zod';

// SPEC-048: validate finance-category create/update. `kind` fixed at creation
// (INCOME vs EXPENSE); `parentId` optional for a 2-level tree.
const categoryKind = z.enum(['INCOME', 'EXPENSE']);

export const createFinanceCategorySchema = z.object({
  kind: categoryKind,
  name: z.string().trim().min(1, 'Tên danh mục là bắt buộc').max(120),
  parentId: z.string().optional().nullable(),
});

export const updateFinanceCategorySchema = z
  .object({
    name: z.string().trim().min(1, 'Tên danh mục là bắt buộc').max(120),
    parentId: z.string().nullable(),
    active: z.boolean(),
  })
  .partial();

export const financeCategoryListQuerySchema = z.object({
  kind: categoryKind.optional(),
  active: z.coerce.boolean().optional(),
});

export type CreateFinanceCategoryInput = z.infer<typeof createFinanceCategorySchema>;
export type UpdateFinanceCategoryInput = z.infer<typeof updateFinanceCategorySchema>;
