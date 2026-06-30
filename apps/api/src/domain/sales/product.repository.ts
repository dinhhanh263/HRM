import type { Prisma, ProductStatus } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

export interface ProductListOptions {
  search?: string;
  status?: ProductStatus;
  page: number;
  limit: number;
}

export const productRepository = {
  async list(tenantId: string, opts: ProductListOptions) {
    const where: Prisma.ProductWhereInput = { tenantId };
    if (opts.status) where.status = opts.status;
    if (opts.search) {
      where.OR = [
        { name: { contains: opts.search, mode: 'insensitive' } },
        { sku: { contains: opts.search, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await Promise.all([
      db.product.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
      }),
      db.product.count({ where }),
    ]);
    return { data, total };
  },

  async findById(tenantId: string, id: string) {
    return db.product.findFirst({ where: { id, tenantId } });
  },

  async create(data: Prisma.ProductUncheckedCreateInput) {
    return db.product.create({ data });
  },

  async update(tenantId: string, id: string, data: Prisma.ProductUncheckedUpdateInput) {
    const res = await db.product.updateMany({ where: { id, tenantId }, data });
    if (res.count === 0) return null;
    return db.product.findFirst({ where: { id, tenantId } });
  },

  async usageCount(productId: string) {
    return db.quoteItem.count({ where: { productId } });
  },

  async remove(tenantId: string, id: string) {
    const res = await db.product.deleteMany({ where: { id, tenantId } });
    return res.count > 0;
  },
};
