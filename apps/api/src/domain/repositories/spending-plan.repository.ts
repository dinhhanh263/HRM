import type { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

const withRefs = {
  department: { select: { name: true } },
  issuingEntity: { select: { name: true } },
  items: { include: { category: { select: { name: true } } }, orderBy: { title: 'asc' } },
} as const;

export const spendingPlanRepository = {
  async findMany(tenantId: string, where: Prisma.SpendingPlanWhereInput) {
    return db.spendingPlan.findMany({
      where: { tenantId, ...where },
      include: withRefs,
      orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
    });
  },

  async findById(id: string, tenantId: string) {
    return db.spendingPlan.findFirst({ where: { id, tenantId }, include: withRefs });
  },
};
