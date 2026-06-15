import { db } from '../../infrastructure/database/client.js';
import type { Prisma } from '@prisma/client';
import type { DashboardDepartmentSlice, DashboardPendingLeave } from '@hrm/shared';

/** Raw fields the service needs to derive birthday/anniversary/new-joiner events. */
export interface EventSourceEmployee {
  id: string;
  fullName: string;
  dateOfBirth: Date | null;
  joinDate: Date;
  departmentName: string | null;
  /** HR-entered probation end date; null when probation doesn't apply. */
  probationEndDate: Date | null;
  /** End date of the employee's ACTIVE contract; null = indefinite or none. */
  contractEndDate: Date | null;
}

/**
 * `employeeIds === undefined` → company-wide (no employee constraint).
 * An empty array → matches no employee (graceful empties for profile-less users).
 */
type EmployeeFilter = string[] | undefined;

function employeeIdWhere(employeeIds: EmployeeFilter): { id?: { in: string[] } } {
  return employeeIds === undefined ? {} : { id: { in: employeeIds } };
}

function leaveEmployeeWhere(employeeIds: EmployeeFilter): { employeeId?: { in: string[] } } {
  return employeeIds === undefined ? {} : { employeeId: { in: employeeIds } };
}

export const dashboardRepository = {
  async countActiveEmployees(tenantId: string, employeeIds: EmployeeFilter): Promise<number> {
    return db.employee.count({
      where: { tenantId, status: 'ACTIVE', ...employeeIdWhere(employeeIds) },
    });
  },

  async countPendingLeave(tenantId: string, employeeIds: EmployeeFilter): Promise<number> {
    return db.leaveRequest.count({
      where: { tenantId, status: 'PENDING', ...leaveEmployeeWhere(employeeIds) },
    });
  },

  async countOnLeaveToday(
    tenantId: string,
    employeeIds: EmployeeFilter,
    dayStart: Date,
    dayEnd: Date,
  ): Promise<number> {
    // An employee is "on leave today" if an APPROVED request brackets today.
    const employeeWhere = employeeIds === undefined ? {} : { employeeId: { in: employeeIds } };
    return db.leaveRequest.count({
      where: {
        tenantId,
        status: 'APPROVED',
        startDate: { lte: dayEnd },
        endDate: { gte: dayStart },
        ...employeeWhere,
      },
    });
  },

  async countNewHires(
    tenantId: string,
    employeeIds: EmployeeFilter,
    monthStart: Date,
    nextMonthStart: Date,
  ): Promise<number> {
    return db.employee.count({
      where: {
        tenantId,
        joinDate: { gte: monthStart, lt: nextMonthStart },
        ...employeeIdWhere(employeeIds),
      },
    });
  },

  async countTerminated(
    tenantId: string,
    employeeIds: EmployeeFilter,
    monthStart: Date,
    nextMonthStart: Date,
  ): Promise<number> {
    return db.employee.count({
      where: {
        tenantId,
        terminatedAt: { gte: monthStart, lt: nextMonthStart },
        ...employeeIdWhere(employeeIds),
      },
    });
  },

  /** Departments with at least one ACTIVE employee in scope. */
  async countActiveDepartments(tenantId: string, employeeIds: EmployeeFilter): Promise<number> {
    const where: Prisma.EmployeeWhereInput = {
      tenantId,
      status: 'ACTIVE',
      departmentId: { not: null },
      ...employeeIdWhere(employeeIds),
    };
    const groups = await db.employee.groupBy({ by: ['departmentId'], where });
    return groups.length;
  },

  /** ACTIVE-employee headcount per department, in scope, largest first. */
  async departmentDistribution(
    tenantId: string,
    employeeIds: EmployeeFilter,
  ): Promise<DashboardDepartmentSlice[]> {
    const where: Prisma.EmployeeWhereInput = {
      tenantId,
      status: 'ACTIVE',
      departmentId: { not: null },
      ...employeeIdWhere(employeeIds),
    };
    const groups = await db.employee.groupBy({
      by: ['departmentId'],
      where,
      _count: { _all: true },
    });
    const departmentIds = groups.map((g) => g.departmentId as string);
    const departments = await db.department.findMany({
      where: { id: { in: departmentIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(departments.map((d) => [d.id, d.name]));
    return groups
      .map((g) => ({
        departmentId: g.departmentId as string,
        name: nameById.get(g.departmentId as string) ?? '—',
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count);
  },

  /** Most recent PENDING leave requests in scope, newest first. Read-only view. */
  async findPendingLeave(
    tenantId: string,
    employeeIds: EmployeeFilter,
    limit = 5,
  ): Promise<DashboardPendingLeave[]> {
    const rows = await db.leaveRequest.findMany({
      where: { tenantId, status: 'PENDING', ...leaveEmployeeWhere(employeeIds) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        startDate: true,
        endDate: true,
        totalDays: true,
        createdAt: true,
        employee: { select: { fullName: true } },
        leaveType: { select: { name: true, colorHex: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      employeeName: r.employee.fullName,
      leaveType: { name: r.leaveType.name, colorHex: r.leaveType.colorHex },
      startDate: r.startDate.toISOString(),
      endDate: r.endDate.toISOString(),
      totalDays: r.totalDays,
      createdAt: r.createdAt.toISOString(),
    }));
  },

  /** Active employees in scope with the raw fields needed to derive events. */
  async findEventSourceEmployees(
    tenantId: string,
    employeeIds: EmployeeFilter,
  ): Promise<EventSourceEmployee[]> {
    const rows = await db.employee.findMany({
      where: { tenantId, status: 'ACTIVE', ...employeeIdWhere(employeeIds) },
      select: {
        id: true,
        fullName: true,
        dateOfBirth: true,
        joinDate: true,
        department: { select: { name: true } },
        probationEndDate: true,
        // One ACTIVE contract per employee (enforced invariant); take its endDate.
        // orderBy makes the pick deterministic should the invariant ever break.
        contracts: {
          where: { status: 'ACTIVE' },
          select: { endDate: true },
          orderBy: { startDate: 'desc' },
          take: 1,
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      dateOfBirth: r.dateOfBirth,
      joinDate: r.joinDate,
      departmentName: r.department?.name ?? null,
      probationEndDate: r.probationEndDate,
      contractEndDate: r.contracts[0]?.endDate ?? null,
    }));
  },

  /** Ids of the employees who report directly to the given manager. */
  async findReportIds(managerEmployeeId: string, tenantId: string): Promise<string[]> {
    const reports = await db.employee.findMany({
      where: { tenantId, managerId: managerEmployeeId },
      select: { id: true },
    });
    return reports.map((r) => r.id);
  },
};
