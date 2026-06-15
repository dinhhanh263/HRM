import { db } from '../../infrastructure/database/client.js';
import type { Prisma } from '@prisma/client';

export interface ProbationGuidelineFilters {
  year?: number;
  language?: string;
}

export const probationGuidelineRepository = {
  async findAll(tenantId: string, filters: ProbationGuidelineFilters = {}) {
    const where: Prisma.ProbationGuidelineWhereInput = { tenantId };
    if (filters.year !== undefined) {
      where.year = filters.year;
    }
    if (filters.language !== undefined) {
      where.language = filters.language;
    }

    return db.probationGuideline.findMany({
      where,
      orderBy: [{ year: 'desc' }, { order: 'asc' }, { createdAt: 'asc' }],
    });
  },

  async findById(id: string, tenantId: string) {
    return db.probationGuideline.findFirst({ where: { id, tenantId } });
  },

  async create(data: Prisma.ProbationGuidelineCreateInput) {
    return db.probationGuideline.create({ data });
  },

  async update(id: string, tenantId: string, data: Prisma.ProbationGuidelineUpdateInput) {
    return db.probationGuideline.update({ where: { id, tenantId }, data });
  },

  async delete(id: string, tenantId: string) {
    return db.probationGuideline.delete({ where: { id, tenantId } });
  },
};
