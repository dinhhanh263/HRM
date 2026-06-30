import { z } from 'zod';
import { QuoteStatus } from '@prisma/client';

const itemSchema = z.object({
  productId: z.string().cuid().optional().nullable(),
  description: z.string().trim().max(300).optional(),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
  discountPct: z.coerce.number().min(0).max(100).optional(),
});

export const createQuoteSchema = z.object({
  items: z.array(itemSchema).min(1, 'Báo giá cần ít nhất 1 dòng'),
  isPrimary: z.boolean().optional(),
  status: z.nativeEnum(QuoteStatus).optional(),
  validUntil: z.string().optional().nullable(),
  issuingEntityId: z.string().cuid().optional().nullable(),
});

export const updateQuoteSchema = z.object({
  items: z.array(itemSchema).min(1).optional(),
  isPrimary: z.boolean().optional(),
  status: z.nativeEnum(QuoteStatus).optional(),
  validUntil: z.string().nullable().optional(),
  issuingEntityId: z.string().cuid().nullable().optional(),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
