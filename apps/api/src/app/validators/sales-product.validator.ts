import { z } from 'zod';
import { ProductStatus } from '@prisma/client';

export const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Tên sản phẩm là bắt buộc').max(200),
  sku: z.string().trim().max(60).optional(),
  description: z.string().trim().max(1000).optional(),
  unitPrice: z.coerce.number().min(0).optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  unit: z.string().trim().max(40).optional(),
});

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    sku: z.string().trim().max(60),
    description: z.string().trim().max(1000),
    unitPrice: z.coerce.number().min(0),
    currency: z.string().trim().min(1).max(8),
    unit: z.string().trim().max(40),
    status: z.nativeEnum(ProductStatus),
  })
  .partial();

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: z.nativeEnum(ProductStatus).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsInput = z.infer<typeof listProductsQuerySchema>;
