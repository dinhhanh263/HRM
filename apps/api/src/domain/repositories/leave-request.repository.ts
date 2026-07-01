import { db } from '../../infrastructure/database/client.js';
import type { Prisma, LeaveStatus, ApprovalDecision, ApproverType } from '@prisma/client';
import type { PaginationOptions } from './employee.repository.js';

export interface LeaveRequestFilters {
  employeeId?: string;
  status?: LeaveStatus;
  leaveTypeId?: string;
  year?: number;
  search?: string;
}

const requestInclude = {
  leaveType: { select: { id: true, name: true, code: true, colorHex: true, paid: true } },
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
} satisfies Prisma.LeaveRequestInclude;

// Detail include adds the full approval timeline (all rounds) for a single request.
// SPEC-046: also pull the flow's CC/watchers so the caller can decide watcher visibility.
const requestDetailInclude = {
  ...requestInclude,
  approvals: {
    orderBy: [{ round: 'asc' }, { stepOrder: 'asc' }],
    include: { decidedBy: { select: { id: true, fullName: true } } },
  },
  flow: { select: { watchers: { select: { watcherType: true, roleKey: true, watcherId: true } } } },
} satisfies Prisma.LeaveRequestInclude;

export const leaveRequestRepository = {
  async findAll(
    tenantId: string,
    filters: LeaveRequestFilters = {},
    pagination: PaginationOptions = { page: 1, limit: 20 },
  ) {
    const where: Prisma.LeaveRequestWhereInput = { tenantId };

    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.status) where.status = filters.status;
    if (filters.leaveTypeId) where.leaveTypeId = filters.leaveTypeId;

    if (filters.year) {
      where.startDate = {
        gte: new Date(Date.UTC(filters.year, 0, 1)),
        lte: new Date(Date.UTC(filters.year, 11, 31, 23, 59, 59, 999)),
      };
    }

    if (filters.search) {
      where.employee = {
        OR: [
          { fullName: { contains: filters.search, mode: 'insensitive' } },
          { employeeCode: { contains: filters.search, mode: 'insensitive' } },
        ],
      };
    }

    const skip = (pagination.page - 1) * pagination.limit;

    const [requests, total] = await Promise.all([
      db.leaveRequest.findMany({
        where,
        include: requestInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pagination.limit,
      }),
      db.leaveRequest.count({ where }),
    ]);

    return {
      data: requests,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  },

  async findById(id: string, tenantId: string) {
    return db.leaveRequest.findFirst({
      where: { id, tenantId },
      include: requestInclude,
    });
  },

  /** A single request with its full approval timeline (for detail + step actions). */
  async findByIdWithApprovals(id: string, tenantId: string) {
    return db.leaveRequest.findFirst({
      where: { id, tenantId },
      include: requestDetailInclude,
    });
  },

  /**
   * Pending requests where the actor is plausibly an approver — used to build the
   * review queue. This is a coarse pre-filter (matches the actor on ANY undecided
   * step); the service narrows it to the *current* step. Legacy single-step
   * requests (flowId=null) are included for any capability-holder; SUPER_ADMIN
   * sees every flow request.
   */
  async findReviewCandidates(
    tenantId: string,
    actor: { employeeId: string | null; roleKey: string | null; isSuperAdmin: boolean },
    filters: Pick<LeaveRequestFilters, 'leaveTypeId' | 'year' | 'search'> = {},
  ) {
    const where: Prisma.LeaveRequestWhereInput = { tenantId, status: 'PENDING' };
    if (filters.leaveTypeId) where.leaveTypeId = filters.leaveTypeId;
    if (filters.year) {
      where.startDate = {
        gte: new Date(Date.UTC(filters.year, 0, 1)),
        lte: new Date(Date.UTC(filters.year, 11, 31, 23, 59, 59, 999)),
      };
    }
    if (filters.search) {
      where.employee = {
        OR: [
          { fullName: { contains: filters.search, mode: 'insensitive' } },
          { employeeCode: { contains: filters.search, mode: 'insensitive' } },
        ],
      };
    }

    // Legacy requests are reviewable by anyone holding the capability (route-gated).
    const involvement: Prisma.LeaveRequestWhereInput[] = [{ flowId: null }];
    if (actor.isSuperAdmin) {
      involvement.push({ flowId: { not: null } });
    } else {
      const approverOr: Prisma.LeaveApprovalWhereInput[] = [];
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
    where.OR = involvement;

    return db.leaveRequest.findMany({
      where,
      include: requestDetailInclude,
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * SPEC-046: requests the actor watches (CC) — any status — because their flow
   * lists the actor as a ROLE or SPECIFIC_USER watcher. View-only; the actor is
   * never an approver here (that is enforced separately at the approve endpoint).
   */
  async findWatchedCandidates(
    tenantId: string,
    actor: { employeeId: string | null; roleKey: string | null },
    filters: LeaveRequestFilters = {},
    pagination: PaginationOptions = { page: 1, limit: 20 },
  ) {
    const watcherOr: Prisma.ApprovalWatcherWhereInput[] = [];
    if (actor.roleKey) watcherOr.push({ watcherType: 'ROLE', roleKey: actor.roleKey });
    if (actor.employeeId)
      watcherOr.push({ watcherType: 'SPECIFIC_USER', watcherId: actor.employeeId });

    // No matchable identity → empty page (avoids a where that matches everything).
    if (watcherOr.length === 0) {
      return {
        data: [],
        pagination: { page: pagination.page, limit: pagination.limit, total: 0, totalPages: 0 },
      };
    }

    const where: Prisma.LeaveRequestWhereInput = {
      tenantId,
      flow: { is: { watchers: { some: { OR: watcherOr } } } },
    };
    if (filters.status) where.status = filters.status;
    if (filters.leaveTypeId) where.leaveTypeId = filters.leaveTypeId;
    if (filters.year) {
      where.startDate = {
        gte: new Date(Date.UTC(filters.year, 0, 1)),
        lte: new Date(Date.UTC(filters.year, 11, 31, 23, 59, 59, 999)),
      };
    }
    if (filters.search) {
      where.employee = {
        OR: [
          { fullName: { contains: filters.search, mode: 'insensitive' } },
          { employeeCode: { contains: filters.search, mode: 'insensitive' } },
        ],
      };
    }

    const skip = (pagination.page - 1) * pagination.limit;
    const [requests, total] = await Promise.all([
      db.leaveRequest.findMany({
        where,
        include: requestInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pagination.limit,
      }),
      db.leaveRequest.count({ where }),
    ]);

    return {
      data: requests,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  },

  /**
   * SPEC-046: resolve the set of recipient User ids for a flow's CC/watchers.
   * ROLE watchers expand to every user holding that role; SPECIFIC_USER watchers
   * expand to the linked employee's user (if any). Returns a de-duplicated list.
   */
  async findWatcherRecipientUserIds(tenantId: string, flowId: string): Promise<string[]> {
    const watchers = await db.approvalWatcher.findMany({
      where: { flowId },
      select: { watcherType: true, roleKey: true, watcherId: true },
    });
    if (watchers.length === 0) return [];

    const roleKeys = watchers
      .filter((w) => w.watcherType === 'ROLE' && w.roleKey)
      .map((w) => w.roleKey as string);
    const employeeIds = watchers
      .filter((w) => w.watcherType === 'SPECIFIC_USER' && w.watcherId)
      .map((w) => w.watcherId as string);

    const userIds = new Set<string>();

    if (roleKeys.length) {
      const roleUsers = await db.user.findMany({
        where: { tenantId, roleRef: { key: { in: roleKeys } } },
        select: { id: true },
      });
      roleUsers.forEach((u) => userIds.add(u.id));
    }

    if (employeeIds.length) {
      const employees = await db.employee.findMany({
        where: { tenantId, id: { in: employeeIds } },
        select: { userId: true },
      });
      employees.forEach((e) => userIds.add(e.userId));
    }

    return [...userIds];
  },

  /**
   * SPEC-046: a flow's CC/watchers reduced to concrete targets — specific-user
   * employee ids and role keys — ready to resolve into email recipients.
   */
  async findFlowWatcherTargets(
    flowId: string,
  ): Promise<{ employeeIds: string[]; roleKeys: string[] }> {
    const watchers = await db.approvalWatcher.findMany({
      where: { flowId },
      select: { watcherType: true, roleKey: true, watcherId: true },
    });
    return {
      roleKeys: watchers
        .filter((w) => w.watcherType === 'ROLE' && w.roleKey)
        .map((w) => w.roleKey as string),
      employeeIds: watchers
        .filter((w) => w.watcherType === 'SPECIFIC_USER' && w.watcherId)
        .map((w) => w.watcherId as string),
    };
  },

  /**
   * SPEC-046: resolve email recipients for a set of employees and/or role keys.
   * Only ACTIVE users are returned; the result is de-duplicated by user id (a
   * user matching both an employee and a role appears once).
   */
  async findUserRecipients(
    tenantId: string,
    employeeIds: string[],
    roleKeys: string[],
  ): Promise<{ userId: string; email: string; fullName: string }[]> {
    if (employeeIds.length === 0 && roleKeys.length === 0) return [];

    const or: Prisma.UserWhereInput[] = [];
    if (employeeIds.length) or.push({ employee: { id: { in: employeeIds } } });
    if (roleKeys.length) or.push({ roleRef: { key: { in: roleKeys } } });

    const users = await db.user.findMany({
      where: { tenantId, status: 'ACTIVE', OR: or },
      select: { id: true, email: true, fullName: true },
    });
    return users.map((u) => ({ userId: u.id, email: u.email, fullName: u.fullName }));
  },

  /**
   * APPROVED leave requests for an employee that overlap [startDate, endDate],
   * carrying the leave type's `paid` flag so the timesheet summary can split paid
   * vs unpaid leave days. Tenant-scoped.
   */
  async findApprovedInRange(tenantId: string, employeeId: string, startDate: Date, endDate: Date) {
    return db.leaveRequest.findMany({
      where: {
        tenantId,
        employeeId,
        status: 'APPROVED',
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: {
        startDate: true,
        endDate: true,
        halfDay: true,
        leaveType: { select: { paid: true } },
      },
    });
  },

  /** A PENDING or APPROVED request that overlaps the given date range. */
  async findOverlapping(employeeId: string, startDate: Date, endDate: Date) {
    return db.leaveRequest.findFirst({
      where: {
        employeeId,
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
  },

  async create(data: Prisma.LeaveRequestCreateInput) {
    return db.leaveRequest.create({ data, include: requestInclude });
  },

  /**
   * Create a request together with its snapshotted approval timeline in one
   * transaction, so a multi-step request never exists without its LeaveApproval
   * rows. `approvals` omit requestId — it is wired to the new request.
   */
  async createWithApprovals(
    data: Prisma.LeaveRequestCreateInput,
    approvals: Omit<Prisma.LeaveApprovalCreateManyInput, 'requestId'>[],
  ) {
    return db.$transaction(async (tx) => {
      const request = await tx.leaveRequest.create({ data });
      if (approvals.length) {
        await tx.leaveApproval.createMany({
          data: approvals.map((a) => ({ ...a, requestId: request.id })),
        });
      }
      return tx.leaveRequest.findFirstOrThrow({ where: { id: request.id }, include: requestInclude });
    });
  },

  async update(id: string, tenantId: string, data: Prisma.LeaveRequestUpdateInput) {
    return db.leaveRequest.update({
      where: { id, tenantId },
      data,
      include: requestInclude,
    });
  },

  /**
   * Record a decision on one approval step and advance/finalize the request in a
   * single transaction, so the timeline and the request never diverge.
   */
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
    requestData: Prisma.LeaveRequestUpdateInput,
  ) {
    return db.$transaction(async (tx) => {
      await tx.leaveApproval.update({ where: { id: approvalId }, data: approvalData });
      await tx.leaveRequest.update({ where: { id: requestId, tenantId }, data: requestData });
      return tx.leaveRequest.findFirstOrThrow({ where: { id: requestId }, include: requestDetailInclude });
    });
  },

  /**
   * Re-open a RETURNED request: reset its routing fields and snapshot a fresh
   * round of approvals, keeping the previous rounds intact for history.
   */
  async resubmit(
    requestId: string,
    tenantId: string,
    requestData: Prisma.LeaveRequestUpdateInput,
    approvals: Omit<Prisma.LeaveApprovalCreateManyInput, 'requestId'>[],
  ) {
    return db.$transaction(async (tx) => {
      await tx.leaveRequest.update({ where: { id: requestId, tenantId }, data: requestData });
      if (approvals.length) {
        await tx.leaveApproval.createMany({
          data: approvals.map((a) => ({ ...a, requestId })),
        });
      }
      return tx.leaveRequest.findFirstOrThrow({ where: { id: requestId }, include: requestDetailInclude });
    });
  },

  /** Sum totalDays grouped by status for an employee + leave-type within a year. */
  async aggregateDaysByStatus(employeeId: string, year: number) {
    return db.leaveRequest.groupBy({
      by: ['leaveTypeId', 'status'],
      where: {
        employeeId,
        startDate: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
        },
        status: { in: ['APPROVED', 'PENDING'] },
      },
      _sum: { totalDays: true },
    });
  },

  /** Batch variant of {@link aggregateDaysByStatus} for the roster view: sum
   *  totalDays grouped by employee + leave-type + status across a set of
   *  employees in one query, so usage for the whole roster is computed without
   *  an N+1 sweep. */
  async aggregateDaysByStatusForEmployees(employeeIds: string[], year: number) {
    return db.leaveRequest.groupBy({
      by: ['employeeId', 'leaveTypeId', 'status'],
      where: {
        employeeId: { in: employeeIds },
        startDate: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
        },
        status: { in: ['APPROVED', 'PENDING'] },
      },
      _sum: { totalDays: true },
    });
  },
};
