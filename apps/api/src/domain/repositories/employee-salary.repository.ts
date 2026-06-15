import { db } from '../../infrastructure/database/client.js';
import type { AllowanceItem } from '@hrm/shared';
import type { Prisma } from '@prisma/client';

// The plain shape the service hands the repository for a new effective-dated row.
// The repository translates this into Prisma relation-connect input.
export interface NewSalaryData {
  tenantId: string;
  employeeId: string;
  baseSalary: string;
  allowances: AllowanceItem[];
  effectiveFrom: Date;
  note: string | null;
  createdById: string | null;
}

// Joins the employee (+ department name) so list/detail views can render rows
// without a second round-trip.
const employeeInclude = {
  employee: {
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      avatar: true,
      department: { select: { name: true } },
    },
  },
} satisfies Prisma.EmployeeSalaryInclude;

export const employeeSalaryRepository = {
  /**
   * Active employees paired with their salary in force at `asOf` (at most one,
   * thanks to the non-overlap invariant). One query — the in-force salary is
   * fetched as a bounded nested relation, avoiding an N+1 across the roster.
   */
  async listRoster(
    tenantId: string,
    asOf: Date,
    filter: { departmentId?: string; search?: string },
  ) {
    return db.employee.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
        ...(filter.search
          ? {
              OR: [
                { fullName: { contains: filter.search, mode: 'insensitive' } },
                { employeeCode: { contains: filter.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        employeeCode: true,
        avatar: true,
        department: { select: { name: true } },
        salaries: {
          where: {
            effectiveFrom: { lte: asOf },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
          },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
      },
    });
  },

  async findByEmployee(tenantId: string, employeeId: string) {
    return db.employeeSalary.findMany({
      where: { tenantId, employeeId },
      orderBy: { effectiveFrom: 'desc' },
      include: employeeInclude,
    });
  },

  /** The record with the greatest effectiveFrom — the head of the history. */
  async findLatest(tenantId: string, employeeId: string) {
    return db.employeeSalary.findFirst({
      where: { tenantId, employeeId },
      orderBy: { effectiveFrom: 'desc' },
    });
  },

  /** The record in force at `asOf`: effectiveFrom <= asOf and (effectiveTo null or >= asOf). */
  async findInForce(tenantId: string, employeeId: string, asOf: Date) {
    return db.employeeSalary.findFirst({
      where: {
        tenantId,
        employeeId,
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
      },
      orderBy: { effectiveFrom: 'desc' },
      include: employeeInclude,
    });
  },

  async findById(tenantId: string, id: string) {
    return db.employeeSalary.findFirst({ where: { id, tenantId }, include: employeeInclude });
  },

  /**
   * Atomically close the prior in-force record (if any) and insert the new one.
   * Wrapping both in a transaction guarantees the history never has two open
   * (effectiveTo === null) records nor a gap between adjacent records.
   */
  async createClosingPrior(
    data: NewSalaryData,
    priorClose: { id: string; effectiveTo: Date } | null,
  ) {
    const create = db.employeeSalary.create({
      data: {
        tenant: { connect: { id: data.tenantId } },
        employee: { connect: { id: data.employeeId } },
        baseSalary: data.baseSalary,
        allowances: data.allowances as unknown as Prisma.InputJsonValue,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: null,
        note: data.note,
        ...(data.createdById ? { createdBy: { connect: { id: data.createdById } } } : {}),
      },
      include: employeeInclude,
    });

    if (!priorClose) {
      return create;
    }

    const [, created] = await db.$transaction([
      db.employeeSalary.update({
        where: { id: priorClose.id },
        data: { effectiveTo: priorClose.effectiveTo },
      }),
      create,
    ]);
    return created;
  },

  /**
   * Delete a record and re-open its immediate predecessor (effectiveTo = null) so
   * the history stays contiguous. Used to undo the most recent salary change.
   */
  async deleteReopeningPrior(tenantId: string, id: string, priorId: string | null) {
    const del = db.employeeSalary.deleteMany({ where: { id, tenantId } });
    if (!priorId) {
      await del;
      return;
    }
    await db.$transaction([
      del,
      db.employeeSalary.update({ where: { id: priorId }, data: { effectiveTo: null } }),
    ]);
  },
};
