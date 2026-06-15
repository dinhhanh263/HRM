import { db } from '../../infrastructure/database/client.js';
import { Prisma } from '@prisma/client';
import type { ApprovalDecision, ApproverType } from '@prisma/client';
import type { OvertimeStatus } from '@hrm/shared';

// Include used when a request needs to carry employee identity (reviewer views).
export const overtimeWithEmployee = {
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
} satisfies Prisma.OvertimeRequestInclude;

// Detail include adds the full approval timeline (all rounds) for one request.
const overtimeDetailInclude = {
  ...overtimeWithEmployee,
  approvals: {
    orderBy: [{ round: 'asc' }, { stepOrder: 'asc' }],
    include: { decidedBy: { select: { id: true, fullName: true } } },
  },
} satisfies Prisma.OvertimeRequestInclude;

export interface OvertimeListFilter {
  // null = tenant-wide (HR); array = restricted to those employee ids; a single
  // id is passed as a one-element array for the 'mine' scope.
  employeeIds: string[] | null;
  status?: OvertimeStatus;
  start?: Date;
  end?: Date;
  page: number;
  limit: number;
}

export const overtimeRepository = {
  async findById(tenantId: string, id: string) {
    return db.overtimeRequest.findFirst({
      where: { id, tenantId },
      include: overtimeWithEmployee,
    });
  },

  // A single request with its full approval timeline (for detail + step actions).
  async findByIdWithApprovals(tenantId: string, id: string) {
    return db.overtimeRequest.findFirst({
      where: { id, tenantId },
      include: overtimeDetailInclude,
    });
  },

  async list(tenantId: string, filter: OvertimeListFilter) {
    const where: Prisma.OvertimeRequestWhereInput = {
      tenantId,
      ...(filter.employeeIds ? { employeeId: { in: filter.employeeIds } } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.start && filter.end ? { workDate: { gte: filter.start, lt: filter.end } } : {}),
    };
    const skip = (filter.page - 1) * filter.limit;
    const [rows, total] = await Promise.all([
      db.overtimeRequest.findMany({
        where,
        include: overtimeWithEmployee,
        orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: filter.limit,
      }),
      db.overtimeRequest.count({ where }),
    ]);
    return { rows, total };
  },

  async create(data: Prisma.OvertimeRequestCreateInput) {
    return db.overtimeRequest.create({ data, include: overtimeWithEmployee });
  },

  // Create a request together with its snapshotted approval timeline in one
  // transaction, so a multi-step request never exists without its OvertimeApproval
  // rows. `approvals` omit overtimeRequestId — it is wired to the new request.
  async createWithApprovals(
    data: Prisma.OvertimeRequestCreateInput,
    approvals: Omit<Prisma.OvertimeApprovalCreateManyInput, 'overtimeRequestId'>[],
  ) {
    return db.$transaction(async (tx) => {
      const request = await tx.overtimeRequest.create({ data });
      if (approvals.length) {
        await tx.overtimeApproval.createMany({
          data: approvals.map((a) => ({ ...a, overtimeRequestId: request.id })),
        });
      }
      return tx.overtimeRequest.findFirstOrThrow({
        where: { id: request.id },
        include: overtimeDetailInclude,
      });
    });
  },

  async update(id: string, tenantId: string, data: Prisma.OvertimeRequestUpdateInput) {
    return db.overtimeRequest.update({ where: { id, tenantId }, data, include: overtimeWithEmployee });
  },

  // Record a decision on one approval step and advance/finalize the request in a
  // single transaction, so the timeline and the request never diverge.
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
    requestData: Prisma.OvertimeRequestUpdateInput,
  ) {
    return db.$transaction(async (tx) => {
      await tx.overtimeApproval.update({ where: { id: approvalId }, data: approvalData });
      await tx.overtimeRequest.update({ where: { id: requestId, tenantId }, data: requestData });
      return tx.overtimeRequest.findFirstOrThrow({
        where: { id: requestId },
        include: overtimeDetailInclude,
      });
    });
  },

  // Re-open a RETURNED request: reset its routing fields and snapshot a fresh
  // round of approvals, keeping the previous rounds intact for history.
  async resubmit(
    requestId: string,
    tenantId: string,
    requestData: Prisma.OvertimeRequestUpdateInput,
    approvals: Omit<Prisma.OvertimeApprovalCreateManyInput, 'overtimeRequestId'>[],
  ) {
    return db.$transaction(async (tx) => {
      await tx.overtimeRequest.update({ where: { id: requestId, tenantId }, data: requestData });
      if (approvals.length) {
        await tx.overtimeApproval.createMany({
          data: approvals.map((a) => ({ ...a, overtimeRequestId: requestId })),
        });
      }
      return tx.overtimeRequest.findFirstOrThrow({
        where: { id: requestId },
        include: overtimeDetailInclude,
      });
    });
  },

  // Pending requests where the actor is plausibly an approver — used to build the
  // review queue. Coarse pre-filter (matches the actor on ANY undecided step); the
  // service narrows it to the *current* step. Legacy single-step requests
  // (flowId=null) are included for any capability-holder; SUPER_ADMIN sees every
  // flow request.
  async findReviewCandidates(
    tenantId: string,
    employeeIds: string[] | null,
    actor: { employeeId: string | null; roleKey: string | null; isSuperAdmin: boolean },
    filter: { status?: OvertimeStatus; start?: Date; end?: Date } = {},
  ) {
    const where: Prisma.OvertimeRequestWhereInput = {
      tenantId,
      status: filter.status ?? 'PENDING',
      ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
      ...(filter.start && filter.end ? { workDate: { gte: filter.start, lt: filter.end } } : {}),
    };

    const involvement: Prisma.OvertimeRequestWhereInput[] = [{ flowId: null }];
    if (actor.isSuperAdmin) {
      involvement.push({ flowId: { not: null } });
    } else {
      const approverOr: Prisma.OvertimeApprovalWhereInput[] = [];
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
    where.AND = [{ OR: involvement }];

    return db.overtimeRequest.findMany({
      where,
      include: overtimeDetailInclude,
      orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
    });
  },

  // APPROVED overtime rows for an employee within [start, end), carrying the
  // fields the timesheet summary groups on (category, night, hours, multiplier).
  async findApprovedInRange(tenantId: string, employeeId: string, start: Date, end: Date) {
    return db.overtimeRequest.findMany({
      where: { tenantId, employeeId, status: 'APPROVED', workDate: { gte: start, lt: end } },
      select: { category: true, night: true, hours: true, multiplier: true },
      orderBy: { workDate: 'asc' },
    });
  },

  // Total APPROVED overtime hours for an employee within [start, end). Used to
  // evaluate the advisory monthly/yearly BLLĐ ceilings at approval time.
  async sumApprovedHours(
    tenantId: string,
    employeeId: string,
    start: Date,
    end: Date,
  ): Promise<number> {
    const result = await db.overtimeRequest.aggregate({
      where: {
        tenantId,
        employeeId,
        status: 'APPROVED',
        workDate: { gte: start, lt: end },
      },
      _sum: { hours: true },
    });
    return result._sum.hours ?? 0;
  },
};
