import { db } from '../../infrastructure/database/client.js';
import { Prisma, type PayrollRunStatus } from '@prisma/client';

// Joins the employee (+ department name) and the parent run (for period/status)
// so a payslip renders and self-scopes without an N+1.
const payslipDetailInclude = {
  employee: {
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      avatar: true,
      department: { select: { name: true } },
    },
  },
  payrollRun: { select: { period: true, status: true } },
} satisfies Prisma.PayslipInclude;

export type PayslipWithContext = Prisma.PayslipGetPayload<{ include: typeof payslipDetailInclude }>;

export const payrollPayslipRepository = {
  /**
   * Payslips for one employee, newest period first, filtered by parent-run status
   * (employees only ever see APPROVED/PAID). Tenant-scoped and paginated.
   */
  async listForEmployee(
    tenantId: string,
    employeeId: string,
    filter: { statuses: PayrollRunStatus[]; period?: string },
    page: number,
    limit: number,
  ): Promise<{ rows: PayslipWithContext[]; total: number }> {
    const where: Prisma.PayslipWhereInput = {
      tenantId,
      employeeId,
      payrollRun: {
        status: { in: filter.statuses },
        ...(filter.period ? { period: filter.period } : {}),
      },
    };
    const [rows, total] = await Promise.all([
      db.payslip.findMany({
        where,
        include: payslipDetailInclude,
        orderBy: { payrollRun: { period: 'desc' } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.payslip.count({ where }),
    ]);
    return { rows, total };
  },

  /** A single payslip with its employee + run context. Tenant-scoped. */
  async findById(tenantId: string, id: string): Promise<PayslipWithContext | null> {
    return db.payslip.findFirst({ where: { id, tenantId }, include: payslipDetailInclude });
  },
};
