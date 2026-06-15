import type { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

const withCount = { _count: { select: { assets: true } } } satisfies Prisma.AssetCategoryInclude;

export const assetCategoryRepository = {
  async findAll(tenantId: string) {
    return db.assetCategory.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: withCount,
    });
  },

  async findById(id: string, tenantId: string) {
    return db.assetCategory.findFirst({ where: { id, tenantId }, include: withCount });
  },

  async findByCode(code: string, tenantId: string) {
    return db.assetCategory.findFirst({ where: { code, tenantId } });
  },

  async create(data: Prisma.AssetCategoryUncheckedCreateInput) {
    return db.assetCategory.create({ data, include: withCount });
  },

  async update(id: string, data: Prisma.AssetCategoryUncheckedUpdateInput) {
    return db.assetCategory.update({ where: { id }, data, include: withCount });
  },

  async delete(id: string) {
    return db.assetCategory.delete({ where: { id } });
  },

  async countAssets(categoryId: string) {
    return db.asset.count({ where: { categoryId } });
  },
};
