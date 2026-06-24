import { db } from '../../infrastructure/database/client.js';
import type { Prisma, PurchaseRequestStatus, ApproverType, ApprovalDecision } from '@prisma/client';
import type { PaginationOptions } from './employee.repository.js';

export interface PurchaseRequestFilters {
  employeeId?: string;
  status?: PurchaseRequestStatus;
  vendorName?: string;
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
  orderedBy: { select: { id: true, fullName: true } },
  issuingEntity: { select: { id: true, name: true, active: true } },
  items: { orderBy: { lineNo: 'asc' } },
} satisfies Prisma.PurchaseRequestInclude;

// Detail adds the full approval timeline (all rounds) + attachments.
const requestDetailInclude = {
  ...requestInclude,
  approvals: {
    orderBy: [{ round: 'asc' }, { stepOrder: 'asc' }],
    include: { decidedBy: { select: { id: true, fullName: true } } },
  },
  attachments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.PurchaseRequestInclude;

function buildWhere(tenantId: string, filters: PurchaseRequestFilters): Prisma.PurchaseRequestWhereInput {
  const where: Prisma.PurchaseRequestWhereInput = { tenantId };
  if (filters.employeeId) where.employeeId = filters.employeeId;
  if (filters.status) where.status = filters.status;
  if (filters.vendorName) where.vendorName = { contains: filters.vendorName, mode: 'insensitive' };
  if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
    where.totalAmount = {
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
      { code: { contains: filters.search, mode: 'insensitive' } },
      { title: { contains: filters.search, mode: 'insensitive' } },
      { vendorName: { contains: filters.search, mode: 'insensitive' } },
      { employee: { fullName: { contains: filters.search, mode: 'insensitive' } } },
      { employee: { employeeCode: { contains: filters.search, mode: 'insensitive' } } },
    ];
  }
  return where;
}

export const purchaseRequestRepository = {
  /** Paginated list + the summed totalAmount of the *entire* matching set. */
  async findAll(
    tenantId: string,
    filters: PurchaseRequestFilters = {},
    pagination: PaginationOptions = { page: 1, limit: 20 },
  ) {
    const where = buildWhere(tenantId, filters);
    const skip = (pagination.page - 1) * pagination.limit;

    const [requests, total, sum] = await Promise.all([
      db.purchaseRequest.findMany({
        where,
        include: requestInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pagination.limit,
      }),
      db.purchaseRequest.count({ where }),
      db.purchaseRequest.aggregate({ where, _sum: { totalAmount: true } }),
    ]);

    return {
      data: requests,
      total,
      totalAmount: (sum._sum.totalAmount ?? 0).toString(),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  },

  async findById(id: string, tenantId: string) {
    return db.purchaseRequest.findFirst({ where: { id, tenantId }, include: requestInclude });
  },

  /** All matching rows (no pagination) for export — same filters as findAll. */
  async findAllForExport(tenantId: string, filters: PurchaseRequestFilters = {}) {
    return db.purchaseRequest.findMany({
      where: buildWhere(tenantId, filters),
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
    });
  },

  /** Minimal rows for company-wide yearly statistics (aggregated in the service). */
  async findForStats(tenantId: string, year: number) {
    return db.purchaseRequest.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
        },
      },
      select: {
        createdAt: true,
        totalAmount: true,
        status: true,
        vendorName: true,
        employee: { select: { department: { select: { name: true } } } },
      },
    });
  },

  /** Count requests created by a tenant on a given UTC day — drives the daily code sequence. */
  async countTodayForTenant(tenantId: string, dayStart: Date, dayEnd: Date) {
    return db.purchaseRequest.count({
      where: { tenantId, createdAt: { gte: dayStart, lte: dayEnd } },
    });
  },

  async findByIdWithApprovals(id: string, tenantId: string) {
    return db.purchaseRequest.findFirst({ where: { id, tenantId }, include: requestDetailInclude });
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
    filters: Pick<PurchaseRequestFilters, 'vendorName' | 'minAmount' | 'maxAmount' | 'dateFrom' | 'dateTo' | 'search'> = {},
  ) {
    const where = buildWhere(tenantId, { ...filters, status: 'PENDING' });

    const involvement: Prisma.PurchaseRequestWhereInput[] = [{ flowId: null }];
    if (actor.isSuperAdmin) {
      involvement.push({ flowId: { not: null } });
    } else {
      const approverOr: Prisma.PurchaseRequestApprovalWhereInput[] = [];
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
    where.AND = [...(searchOr ? [{ OR: searchOr }] : []), { OR: involvement }];

    return db.purchaseRequest.findMany({
      where,
      include: requestDetailInclude,
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Create a request + its line items + snapshotted approval timeline atomically.
   * `code` is generated by the service inside this transaction; on the rare unique
   * collision (tenant, code) the service retries with a bumped sequence.
   */
  async createWithApprovals(
    data: Prisma.PurchaseRequestCreateInput,
    approvals: Omit<Prisma.PurchaseRequestApprovalCreateManyInput, 'requestId'>[],
  ) {
    return db.$transaction(async (tx) => {
      const request = await tx.purchaseRequest.create({ data });
      if (approvals.length) {
        await tx.purchaseRequestApproval.createMany({
          data: approvals.map((a) => ({ ...a, requestId: request.id })),
        });
      }
      return tx.purchaseRequest.findFirstOrThrow({ where: { id: request.id }, include: requestDetailInclude });
    });
  },

  async update(id: string, tenantId: string, data: Prisma.PurchaseRequestUpdateInput) {
    return db.purchaseRequest.update({ where: { id, tenantId }, data, include: requestDetailInclude });
  },

  /**
   * Replace a request's line items (delete all + recreate) and update the header
   * totals atomically — used by edit (PATCH) while PENDING/RETURNED.
   */
  async updateWithItems(
    id: string,
    tenantId: string,
    data: Prisma.PurchaseRequestUpdateInput,
    items: Omit<Prisma.PurchaseRequestItemCreateManyInput, 'requestId'>[],
  ) {
    return db.$transaction(async (tx) => {
      await tx.purchaseRequestItem.deleteMany({ where: { requestId: id } });
      await tx.purchaseRequest.update({ where: { id, tenantId }, data });
      if (items.length) {
        await tx.purchaseRequestItem.createMany({ data: items.map((i) => ({ ...i, requestId: id })) });
      }
      return tx.purchaseRequest.findFirstOrThrow({ where: { id }, include: requestDetailInclude });
    });
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
    requestData: Prisma.PurchaseRequestUpdateInput,
  ) {
    return db.$transaction(async (tx) => {
      await tx.purchaseRequestApproval.update({ where: { id: approvalId }, data: approvalData });
      await tx.purchaseRequest.update({ where: { id: requestId, tenantId }, data: requestData });
      return tx.purchaseRequest.findFirstOrThrow({ where: { id: requestId }, include: requestDetailInclude });
    });
  },

  // ---- Attachments ----

  async countAttachments(requestId: string) {
    return db.purchaseRequestAttachment.count({ where: { requestId } });
  },

  async createAttachment(data: Prisma.PurchaseRequestAttachmentCreateInput) {
    return db.purchaseRequestAttachment.create({ data });
  },

  /** An attachment scoped to its parent request + tenant (defence against IDOR). */
  async findAttachmentScoped(attachmentId: string, requestId: string, tenantId: string) {
    return db.purchaseRequestAttachment.findFirst({
      where: { id: attachmentId, requestId, request: { tenantId } },
    });
  },

  async deleteAttachment(attachmentId: string) {
    return db.purchaseRequestAttachment.delete({ where: { id: attachmentId } });
  },

  /**
   * Re-open a RETURNED request with a fresh approval round + replaced items,
   * keeping prior approval rounds (audit trail).
   */
  async resubmit(
    requestId: string,
    tenantId: string,
    requestData: Prisma.PurchaseRequestUpdateInput,
    items: Omit<Prisma.PurchaseRequestItemCreateManyInput, 'requestId'>[],
    approvals: Omit<Prisma.PurchaseRequestApprovalCreateManyInput, 'requestId'>[],
  ) {
    return db.$transaction(async (tx) => {
      await tx.purchaseRequestItem.deleteMany({ where: { requestId } });
      await tx.purchaseRequest.update({ where: { id: requestId, tenantId }, data: requestData });
      if (items.length) {
        await tx.purchaseRequestItem.createMany({ data: items.map((i) => ({ ...i, requestId })) });
      }
      if (approvals.length) {
        await tx.purchaseRequestApproval.createMany({
          data: approvals.map((a) => ({ ...a, requestId })),
        });
      }
      return tx.purchaseRequest.findFirstOrThrow({ where: { id: requestId }, include: requestDetailInclude });
    });
  },
};
