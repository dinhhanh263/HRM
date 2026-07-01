import type { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

const withRefs = {
  issuingEntity: { select: { name: true } },
  fundedAccount: { select: { name: true } },
} as const;

export const topUpRequestRepository = {
  async findMany(tenantId: string, where: Prisma.TopUpRequestWhereInput) {
    return db.topUpRequest.findMany({
      where: { tenantId, ...where },
      include: withRefs,
      orderBy: { createdAt: 'desc' },
    });
  },

  async findById(id: string, tenantId: string) {
    return db.topUpRequest.findFirst({ where: { id, tenantId }, include: withRefs });
  },
};
