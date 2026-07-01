import type { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

// SPEC-048: data access for finance categories. Tenant-scoped everywhere.
export const financeCategoryRepository = {
  async findAll(tenantId: string, filters: { kind?: 'INCOME' | 'EXPENSE'; active?: boolean }) {
    return db.financeCategory.findMany({
      where: {
        tenantId,
        ...(filters.kind && { kind: filters.kind }),
        ...(filters.active !== undefined && { active: filters.active }),
      },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
  },

  async findById(id: string, tenantId: string) {
    return db.financeCategory.findFirst({ where: { id, tenantId } });
  },

  async count(tenantId: string) {
    return db.financeCategory.count({ where: { tenantId } });
  },

  async create(data: Prisma.FinanceCategoryUncheckedCreateInput) {
    return db.financeCategory.create({ data });
  },

  async createMany(data: Prisma.FinanceCategoryUncheckedCreateInput[]) {
    await db.financeCategory.createMany({ data });
  },

  async update(id: string, tenantId: string, data: Prisma.FinanceCategoryUncheckedUpdateInput) {
    await db.financeCategory.update({ where: { id, tenantId }, data });
    return db.financeCategory.findFirstOrThrow({ where: { id, tenantId } });
  },

  async delete(id: string, tenantId: string) {
    await db.financeCategory.delete({ where: { id, tenantId } });
  },

  async countTransactions(categoryId: string) {
    return db.cashTransaction.count({ where: { categoryId } });
  },

  async countChildren(parentId: string) {
    return db.financeCategory.count({ where: { parentId } });
  },
};
