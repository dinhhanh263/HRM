import { db } from '../../infrastructure/database/client.js';
import type { Prisma, PaymentRequestStatus, PaymentRequestType, ApproverType, ApprovalDecision } from '@prisma/client';
import type { PaginationOptions } from './employee.repository.js';

export interface PaymentRequestFilters {
  employeeId?: string;
  status?: PaymentRequestStatus;
  type?: PaymentRequestType;
  minAmount?: number;
  maxAmount?: number;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
}

const requestInclude = {
  employee: {
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      avatar: true,
      department: { select: { name: true } },
    },
  },
  reviewedBy: { select: { id: true, fullName: true } },
  paidBy: { select: { id: true, fullName: true } },
} satisfies Prisma.PaymentRequestInclude;

// Detail adds the full approval timeline (all rounds) + attachments.
const requestDetailInclude = {
  ...requestInclude,
  approvals: {
    orderBy: [{ round: 'asc' }, { stepOrder: 'asc' }],
    include: { decidedBy: { select: { id: true, fullName: true } } },
  },
  attachments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.PaymentRequestInclude;

function buildWhere(tenantId: string, filters: PaymentRequestFilters): Prisma.PaymentRequestWhereInput {
  const where: Prisma.PaymentRequestWhereInput = { tenantId };
  if (filters.employeeId) where.employeeId = filters.employeeId;
  if (filters.status) where.status = filters.status;
  if (filters.type) where.type = filters.type;
  if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
    where.amount = {
      ...(filters.minAmount !== undefined && { gte: filters.minAmount }),
      ...(filters.maxAmount !== undefined && { lte: filters.maxAmount }),
    };
  }
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom && { gte: filters.dateFrom }),
      ...(filters.dateTo && { lte: filters.dateTo }),
    };
  }
  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { vendorName: { contains: filters.search, mode: 'insensitive' } },
      { employee: { fullName: { contains: filters.search, mode: 'insensitive' } } },
      { employee: { employeeCode: { contains: filters.search, mode: 'insensitive' } } },
    ];
  }
  return where;
}

export const paymentRequestRepository = {
  /** Paginated list + the summed amount of the *entire* matching set (for the
   *  "tổng khoản đang chờ" figure shown to approvers/Founder). */
  async findAll(
    tenantId: string,
    filters: PaymentRequestFilters = {},
    pagination: PaginationOptions = { page: 1, limit: 20 },
  ) {
    const where = buildWhere(tenantId, filters);
    const skip = (pagination.page - 1) * pagination.limit;

    const [requests, total, sum] = await Promise.all([
      db.paymentRequest.findMany({
        where,
        include: requestInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pagination.limit,
      }),
      db.paymentRequest.count({ where }),
      db.paymentRequest.aggregate({ where, _sum: { amount: true } }),
    ]);

    return {
      data: requests,
      total,
      totalAmount: (sum._sum.amount ?? 0).toString(),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  },

  async findById(id: string, tenantId: string) {
    return db.paymentRequest.findFirst({ where: { id, tenantId }, include: requestInclude });
  },

  /** All matching rows (no pagination) for export — same filters as findAll. */
  async findAllForExport(tenantId: string, filters: PaymentRequestFilters = {}) {
    return db.paymentRequest.findMany({
      where: buildWhere(tenantId, filters),
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
    });
  },

  /** Minimal rows for company-wide yearly statistics (aggregated in the service). */
  async findForStats(tenantId: string, year: number) {
    return db.paymentRequest.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
        },
      },
      select: { createdAt: true, amount: true, type: true, status: true },
    });
  },

  async findByIdWithApprovals(id: string, tenantId: string) {
    return db.paymentRequest.findFirst({ where: { id, tenantId }, include: requestDetailInclude });
  },

  /**
   * Pending requests where the actor is plausibly an approver — coarse pre-filter
   * for the review queue (matches actor on ANY undecided step); the service narrows
   * to the *current* step. flowId=null requests (defensive fallback) are reviewable
   * by any capability-holder; SUPER_ADMIN sees every flow request.
   */
  async findReviewCandidates(
    tenantId: string,
    actor: { employeeId: string | null; roleKey: string | null; isSuperAdmin: boolean },
    filters: Pick<PaymentRequestFilters, 'type' | 'minAmount' | 'maxAmount' | 'dateFrom' | 'dateTo' | 'search'> = {},
  ) {
    const where = buildWhere(tenantId, { ...filters, status: 'PENDING' });

    const involvement: Prisma.PaymentRequestWhereInput[] = [{ flowId: null }];
    if (actor.isSuperAdmin) {
      involvement.push({ flowId: { not: null } });
    } else {
      const approverOr: Prisma.PaymentRequestApprovalWhereInput[] = [];
      if (actor.employeeId) {
        approverOr.push({
          approverType: { in: ['MANAGER', 'DEPARTMENT_HEAD', 'SPECIFIC_USER'] as ApproverType[] },
          approverId: actor.employeeId,
        });
      }
      if (actor.roleKey) {
        approverOr.push({ approverType: 'ROLE', roleKey: actor.roleKey });
      }
      if (approverOr.length) {
        involvement.push({ approvals: { some: { decision: null, OR: approverOr } } });
      }
    }

    // Combine the search-OR (if any) with the involvement-OR via AND so both hold.
    const searchOr = where.OR;
    delete where.OR;
    where.AND = [
      ...(searchOr ? [{ OR: searchOr }] : []),
      { OR: involvement },
    ];

    return db.paymentRequest.findMany({
      where,
      include: requestDetailInclude,
      orderBy: { createdAt: 'desc' },
    });
  },

  async create(data: Prisma.PaymentRequestCreateInput) {
    return db.paymentRequest.create({ data, include: requestInclude });
  },

  /** Create a request together with its snapshotted approval timeline atomically. */
  async createWithApprovals(
    data: Prisma.PaymentRequestCreateInput,
    approvals: Omit<Prisma.PaymentRequestApprovalCreateManyInput, 'requestId'>[],
  ) {
    return db.$transaction(async (tx) => {
      const request = await tx.paymentRequest.create({ data });
      if (approvals.length) {
        await tx.paymentRequestApproval.createMany({
          data: approvals.map((a) => ({ ...a, requestId: request.id })),
        });
      }
      return tx.paymentRequest.findFirstOrThrow({ where: { id: request.id }, include: requestDetailInclude });
    });
  },

  async update(id: string, tenantId: string, data: Prisma.PaymentRequestUpdateInput) {
    return db.paymentRequest.update({ where: { id, tenantId }, data, include: requestDetailInclude });
  },

  /** Record a decision on one approval step and advance/finalize the request atomically. */
  async recordDecision(
    approvalId: string,
    approvalData: {
      decision: ApprovalDecision;
      decidedById: string | null;
      decidedAt: Date;
      note: string | null;
    },
    requestId: string,
    tenantId: string,
    requestData: Prisma.PaymentRequestUpdateInput,
  ) {
    return db.$transaction(async (tx) => {
      await tx.paymentRequestApproval.update({ where: { id: approvalId }, data: approvalData });
      await tx.paymentRequest.update({ where: { id: requestId, tenantId }, data: requestData });
      return tx.paymentRequest.findFirstOrThrow({ where: { id: requestId }, include: requestDetailInclude });
    });
  },

  // ---- Attachments ----

  async countAttachments(requestId: string) {
    return db.paymentRequestAttachment.count({ where: { requestId } });
  },

  async createAttachment(data: Prisma.PaymentRequestAttachmentCreateInput) {
    return db.paymentRequestAttachment.create({ data });
  },

  /** An attachment scoped to its parent request + tenant (defence against IDOR). */
  async findAttachmentScoped(attachmentId: string, requestId: string, tenantId: string) {
    return db.paymentRequestAttachment.findFirst({
      where: { id: attachmentId, requestId, request: { tenantId } },
    });
  },

  async deleteAttachment(attachmentId: string) {
    return db.paymentRequestAttachment.delete({ where: { id: attachmentId } });
  },

  /** Re-open a RETURNED request with a fresh approval round, keeping prior rounds. */
  async resubmit(
    requestId: string,
    tenantId: string,
    requestData: Prisma.PaymentRequestUpdateInput,
    approvals: Omit<Prisma.PaymentRequestApprovalCreateManyInput, 'requestId'>[],
  ) {
    return db.$transaction(async (tx) => {
      await tx.paymentRequest.update({ where: { id: requestId, tenantId }, data: requestData });
      if (approvals.length) {
        await tx.paymentRequestApproval.createMany({
          data: approvals.map((a) => ({ ...a, requestId })),
        });
      }
      return tx.paymentRequest.findFirstOrThrow({ where: { id: requestId }, include: requestDetailInclude });
    });
  },
};
