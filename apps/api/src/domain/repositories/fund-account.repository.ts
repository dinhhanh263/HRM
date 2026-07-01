import type { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

// SPEC-048: data access for fund accounts. Tenant-scoped everywhere. Reads join the
// issuing entity so the DTO can carry its name without an extra round-trip.
const withEntity = { issuingEntity: { select: { name: true } } } as const;

export const fundAccountRepository = {
  async findAll(tenantId: string, filters: { issuingEntityId?: string; active?: boolean }) {
    return db.fundAccount.findMany({
      where: {
        tenantId,
        ...(filters.issuingEntityId && { issuingEntityId: filters.issuingEntityId }),
        ...(filters.active !== undefined && { active: filters.active }),
      },
      include: withEntity,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  },

  async findById(id: string, tenantId: string) {
    return db.fundAccount.findFirst({ where: { id, tenantId }, include: withEntity });
  },

  async create(data: Prisma.FundAccountUncheckedCreateInput) {
    return db.fundAccount.create({ data, include: withEntity });
  },

  async update(id: string, tenantId: string, data: Prisma.FundAccountUncheckedUpdateInput) {
    await db.fundAccount.update({ where: { id, tenantId }, data });
    return db.fundAccount.findFirstOrThrow({ where: { id, tenantId }, include: withEntity });
  },

  async delete(id: string, tenantId: string) {
    await db.fundAccount.delete({ where: { id, tenantId } });
  },

  async countTransactions(accountId: string) {
    return db.cashTransaction.count({ where: { accountId } });
  },
};
