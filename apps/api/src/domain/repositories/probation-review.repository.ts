import { db } from '../../infrastructure/database/client.js';
import { Prisma, type ProbationReviewStatus } from '@prisma/client';

export interface ProbationReviewFilters {
  status?: ProbationReviewStatus;
  employeeId?: string;
  // Restrict to these employee ids (MANAGER scope); null/undefined = tenant-wide.
  employeeIds?: string[] | null;
  page: number;
  limit: number;
}

// The relation projection every read returns — keeps list and detail DTOs identical.
const reviewInclude = {
  employee: {
    include: {
      department: { select: { name: true } },
      position: { select: { name: true } },
    },
  },
  reviewer: { select: { id: true, fullName: true, avatar: true } },
  decidedBy: { select: { id: true, fullName: true, avatar: true } },
} satisfies Prisma.ProbationReviewInclude;

export const probationReviewRepository = {
  async list(tenantId: string, filters: ProbationReviewFilters) {
    const where: Prisma.ProbationReviewWhereInput = { tenantId };
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.employeeId) {
      where.employeeId = filters.employeeId;
    }
    if (filters.employeeIds) {
      where.employeeId = filters.employeeId
        ? filters.employeeId
        : { in: filters.employeeIds };
    }

    const [rows, total] = await Promise.all([
      db.probationReview.findMany({
        where,
        include: reviewInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      db.probationReview.count({ where }),
    ]);

    return { rows, total };
  },

  async findById(id: string, tenantId: string) {
    return db.probationReview.findFirst({
      where: { id, tenantId },
      include: reviewInclude,
    });
  },

  // An employee may have at most one open (DRAFT|PENDING_HR) review at a time.
  async findOpenForEmployee(employeeId: string, tenantId: string) {
    return db.probationReview.findFirst({
      where: {
        tenantId,
        employeeId,
        status: { in: ['DRAFT', 'PENDING_HR'] },
      },
    });
  },

  async create(data: Prisma.ProbationReviewCreateInput) {
    return db.probationReview.create({ data, include: reviewInclude });
  },

  async update(id: string, tenantId: string, data: Prisma.ProbationReviewUpdateInput) {
    return db.probationReview.update({ where: { id, tenantId }, data, include: reviewInclude });
  },

  /**
   * SPEC-033: ghi self-eval CHỈ khi review vẫn là DRAFT chưa nộp self — điều kiện
   * trong WHERE là guard nguyên tử chống race với submit của manager (TOCTOU).
   * Trả về số dòng cập nhật được (0 = đã bị khóa giữa chừng).
   */
  async updateSelfIfEditable(
    id: string,
    tenantId: string,
    data: Prisma.ProbationReviewUpdateManyMutationInput,
  ): Promise<number> {
    const { count } = await db.probationReview.updateMany({
      where: { id, tenantId, status: 'DRAFT', selfSubmittedAt: null },
      data,
    });
    return count;
  },
};
