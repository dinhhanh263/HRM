import { db } from '../../infrastructure/database/client.js';
import type { Prisma, PrismaClient } from '@prisma/client';

type Tx = Prisma.TransactionClient | PrismaClient;

export const contractRepository = {
  async findByEmployee(employeeId: string, tenantId: string) {
    return db.contract.findMany({
      where: { tenantId, employeeId },
      orderBy: { startDate: 'desc' },
    });
  },

  async findById(id: string, employeeId: string, tenantId: string) {
    return db.contract.findFirst({ where: { id, employeeId, tenantId } });
  },

  /** Expire any ACTIVE contract for the employee — enforces the one-ACTIVE invariant. */
  async expireActive(tx: Tx, employeeId: string, tenantId: string, excludeId?: string) {
    return tx.contract.updateMany({
      where: {
        tenantId,
        employeeId,
        status: 'ACTIVE',
        ...(excludeId && { id: { not: excludeId } }),
      },
      data: { status: 'EXPIRED' },
    });
  },

  async create(tx: Tx, data: Prisma.ContractCreateInput) {
    return tx.contract.create({ data });
  },

  async update(tx: Tx, id: string, data: Prisma.ContractUpdateInput) {
    return tx.contract.update({ where: { id }, data });
  },

  async delete(id: string, tenantId: string) {
    return db.contract.delete({ where: { id, tenantId } });
  },
};
