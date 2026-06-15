import { db } from '../../infrastructure/database/client.js';
import { Prisma, type PayrollRunStatus } from '@prisma/client';
import type { AllowanceItem, PayrollSettingsDto } from '@hrm/shared';
import type { PayslipOvertimeLine } from '../payroll/payslip.engine.js';

// Joins the employee (+ department name) so payslip rows render without an N+1.
const payslipEmployeeInclude = {
  employee: {
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      avatar: true,
      department: { select: { name: true } },
    },
  },
} satisfies Prisma.PayslipInclude;

// The plain shape the service hands the repository for each computed payslip.
export interface PayslipPersistInput {
  employeeId: string;
  baseSalary: number;
  allowances: AllowanceItem[];
  dependents: number;
  workingDays: number;
  daysPresent: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  daysAbsent: number;
  holidayCount: number;
  overtime: PayslipOvertimeLine[];
  proratedBase: number;
  allowanceTotal: number;
  otPay: number;
  grossPay: number;
  socialInsurance: number;
  healthInsurance: number;
  unemploymentInsurance: number;
  insuranceTotal: number;
  taxableIncome: number;
  personalIncomeTax: number;
  unionFee: number;
  otherDeductions: number;
  netPay: number;
}

export interface RunTotalsPersist {
  headcount: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
}

function toPayslipCreateData(
  p: PayslipPersistInput,
  tenantId: string,
): Omit<Prisma.PayslipCreateManyInput, 'payrollRunId'> {
  return {
    tenantId,
    employeeId: p.employeeId,
    baseSalary: p.baseSalary,
    allowances: p.allowances as unknown as Prisma.InputJsonValue,
    dependents: p.dependents,
    workingDays: p.workingDays,
    daysPresent: p.daysPresent,
    paidLeaveDays: p.paidLeaveDays,
    unpaidLeaveDays: p.unpaidLeaveDays,
    daysAbsent: p.daysAbsent,
    holidayCount: p.holidayCount,
    overtime: p.overtime as unknown as Prisma.InputJsonValue,
    proratedBase: p.proratedBase,
    allowanceTotal: p.allowanceTotal,
    otPay: p.otPay,
    grossPay: p.grossPay,
    socialInsurance: p.socialInsurance,
    healthInsurance: p.healthInsurance,
    unemploymentInsurance: p.unemploymentInsurance,
    insuranceTotal: p.insuranceTotal,
    taxableIncome: p.taxableIncome,
    personalIncomeTax: p.personalIncomeTax,
    unionFee: p.unionFee,
    otherDeductions: p.otherDeductions,
    netPay: p.netPay,
  };
}

export const payrollRunRepository = {
  /** The run for a period (no payslips) — used to detect a duplicate/locked run. */
  async findByPeriod(tenantId: string, period: string) {
    return db.payrollRun.findUnique({ where: { tenantId_period: { tenantId, period } } });
  },

  /** The run row alone (no payslips) — used for lifecycle status guards. */
  async findById(tenantId: string, id: string) {
    return db.payrollRun.findFirst({ where: { id, tenantId } });
  },

  /** A run with its payslips (+ employee) for the detail view. */
  async findByIdWithPayslips(tenantId: string, id: string) {
    return db.payrollRun.findFirst({
      where: { id, tenantId },
      include: {
        payslips: { include: payslipEmployeeInclude, orderBy: { employee: { fullName: 'asc' } } },
      },
    });
  },

  async list(
    tenantId: string,
    filter: { status?: PayrollRunStatus; period?: string },
    page: number,
    limit: number,
  ) {
    const where: Prisma.PayrollRunWhereInput = {
      tenantId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.period ? { period: filter.period } : {}),
    };
    const [rows, total] = await Promise.all([
      db.payrollRun.findMany({
        where,
        orderBy: { period: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.payrollRun.count({ where }),
    ]);
    return { rows, total };
  },

  /**
   * Active employees whose salary is in force at `asOf`, with dependents count.
   * One query — the in-force salary is a bounded nested relation (non-overlap
   * invariant guarantees at most one), avoiding an N+1 across the headcount.
   * Employees without an in-force salary still come back (salaries: []) so the
   * service can decide to skip them.
   */
  async listPayableEmployees(tenantId: string, asOf: Date) {
    return db.employee.findMany({
      where: { tenantId, status: 'ACTIVE' },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        dependentsCount: true,
        salaries: {
          where: {
            effectiveFrom: { lte: asOf },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
          },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
          select: { baseSalary: true, allowances: true },
        },
      },
    });
  },

  /**
   * Create (or reset an existing DRAFT/CANCELLED) run for the period and replace
   * its payslips atomically. Resetting clears any prior approval/payment markers
   * so a recomputed DRAFT is clean. Returns the run id; the caller re-reads with
   * payslips for the response.
   */
  async saveDraftWithPayslips(args: {
    tenantId: string;
    period: string;
    runById: string | null;
    existingRunId: string | null;
    totals: RunTotalsPersist;
    payslips: PayslipPersistInput[];
  }): Promise<string> {
    const { tenantId, period, runById, existingRunId, totals, payslips } = args;

    return db.$transaction(async (tx) => {
      let runId: string;
      if (existingRunId) {
        await tx.payrollRun.update({
          where: { id: existingRunId },
          data: {
            status: 'DRAFT',
            headcount: totals.headcount,
            totalGross: totals.totalGross,
            totalDeductions: totals.totalDeductions,
            totalNet: totals.totalNet,
            runById,
            settingsSnapshot: Prisma.DbNull,
            approvedById: null,
            approvedAt: null,
            paidAt: null,
          },
        });
        await tx.payslip.deleteMany({ where: { payrollRunId: existingRunId } });
        runId = existingRunId;
      } else {
        const created = await tx.payrollRun.create({
          data: {
            tenant: { connect: { id: tenantId } },
            period,
            status: 'DRAFT',
            headcount: totals.headcount,
            totalGross: totals.totalGross,
            totalDeductions: totals.totalDeductions,
            totalNet: totals.totalNet,
            runById,
          },
        });
        runId = created.id;
      }

      if (payslips.length > 0) {
        await tx.payslip.createMany({
          data: payslips.map((p) => ({ ...toPayslipCreateData(p, tenantId), payrollRunId: runId })),
        });
      }
      return runId;
    });
  },

  /**
   * Submit a DRAFT run for approval: DRAFT → PENDING_APPROVAL, recording who
   * submitted it and when. The `status: 'DRAFT'` predicate makes the write
   * race-safe and tenant-scoped. Returns the affected row count (0 = no-op).
   */
  async submit(tenantId: string, id: string, submittedById: string | null): Promise<number> {
    const { count } = await db.payrollRun.updateMany({
      where: { id, tenantId, status: 'DRAFT' },
      data: {
        status: 'PENDING_APPROVAL',
        submittedById,
        submittedAt: new Date(),
      },
    });
    return count;
  },

  /**
   * Lock a run as APPROVED, recording the approver and freezing the tenant
   * settings as they stand. The `status: 'PENDING_APPROVAL'` predicate makes the
   * write race-safe: only a submitted run can be approved, and a run that another
   * request already transitioned is a no-op. Tenant-scoped so a cross-tenant id
   * silently affects nothing. Returns the affected row count (0 = nothing
   * transitioned).
   */
  async approve(
    tenantId: string,
    id: string,
    approvedById: string | null,
    settingsSnapshot: PayrollSettingsDto,
  ): Promise<number> {
    const { count } = await db.payrollRun.updateMany({
      where: { id, tenantId, status: 'PENDING_APPROVAL' },
      data: {
        status: 'APPROVED',
        approvedById,
        approvedAt: new Date(),
        settingsSnapshot: settingsSnapshot as unknown as Prisma.InputJsonValue,
      },
    });
    return count;
  },

  /**
   * Reject a submitted run back to the maker: PENDING_APPROVAL → DRAFT, clearing
   * the submission markers so HR can recompute and resubmit. Status-guarded +
   * tenant-scoped. Returns the affected row count (0 = nothing transitioned).
   */
  async reject(tenantId: string, id: string): Promise<number> {
    const { count } = await db.payrollRun.updateMany({
      where: { id, tenantId, status: 'PENDING_APPROVAL' },
      data: {
        status: 'DRAFT',
        submittedById: null,
        submittedAt: null,
      },
    });
    return count;
  },

  /**
   * Active users in the tenant whose role grants `payroll:approve` — the people
   * who should be notified when a run is submitted. The submitter (an Employee)
   * is excluded so a person holding both process+approve isn't emailed about
   * their own submission.
   */
  async findApproverRecipients(
    tenantId: string,
    excludeEmployeeId: string | null,
  ): Promise<{ email: string; fullName: string }[]> {
    const users = await db.user.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        roleRef: { permissions: { some: { permission: { key: 'payroll:approve' } } } },
      },
      select: { email: true, fullName: true, employee: { select: { id: true } } },
    });
    return users
      .filter((u) => !excludeEmployeeId || u.employee?.id !== excludeEmployeeId)
      .map((u) => ({ email: u.email, fullName: u.fullName }));
  },

  /** APPROVED → PAID, recording paidAt. Status-guarded + tenant-scoped. */
  async markPaid(tenantId: string, id: string): Promise<number> {
    const { count } = await db.payrollRun.updateMany({
      where: { id, tenantId, status: 'APPROVED' },
      data: { status: 'PAID', paidAt: new Date() },
    });
    return count;
  },

  /** Cancel a DRAFT, PENDING_APPROVAL or APPROVED run. Status-guarded + tenant-scoped. */
  async cancel(tenantId: string, id: string): Promise<number> {
    const { count } = await db.payrollRun.updateMany({
      where: { id, tenantId, status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] } },
      data: { status: 'CANCELLED' },
    });
    return count;
  },
};
