import { db } from '../../infrastructure/database/client.js';
import { Prisma } from '@prisma/client';

export interface ProbationCriteriaFilters {
  activeOnly?: boolean;
}

export const probationCriteriaRepository = {
  async findAll(tenantId: string, filters: ProbationCriteriaFilters = {}) {
    const where: Prisma.ProbationCriteriaWhereInput = { tenantId };
    if (filters.activeOnly) {
      where.isActive = true;
    }

    return db.probationCriteria.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { order: 'asc' }, { name: 'asc' }],
    });
  },

  async findById(id: string, tenantId: string) {
    return db.probationCriteria.findFirst({ where: { id, tenantId } });
  },

  async create(data: Prisma.ProbationCriteriaCreateInput) {
    return db.probationCriteria.create({ data });
  },

  async update(id: string, tenantId: string, data: Prisma.ProbationCriteriaUpdateInput) {
    return db.probationCriteria.update({ where: { id, tenantId }, data });
  },

  async delete(id: string, tenantId: string) {
    return db.probationCriteria.delete({ where: { id, tenantId } });
  },

  /** Count reviews whose `ratings` JSON references this criterion id — gates deletion. */
  async countReviewsUsing(criteriaId: string, tenantId: string): Promise<number> {
    return db.probationReview.count({
      where: { tenantId, ratings: { path: [criteriaId], not: Prisma.DbNull } },
    });
  },
};
