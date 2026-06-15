import { db } from '../../infrastructure/database/client.js';

export const leaveBalanceRepository = {
  /** Per-employee allocation overrides for a year. Absent rows fall back to the
   *  leave type's defaultDays. */
  async findForEmployeeYear(employeeId: string, year: number) {
    return db.leaveBalance.findMany({ where: { employeeId, year } });
  },

  /** Batch variant of {@link findForEmployeeYear} for the roster view: all
   *  allocation overrides for a set of employees in a year, fetched in one query
   *  to avoid an N+1 sweep across employees. */
  async findManyForEmployeesYear(employeeIds: string[], year: number) {
    return db.leaveBalance.findMany({
      where: { employeeId: { in: employeeIds }, year },
    });
  },

  /** Set the per-employee allocation override for a leave type in a year.
   *  Keyed on the [tenantId, employeeId, leaveTypeId, year] unique constraint so
   *  repeated edits update in place rather than duplicating rows. */
  async upsertAllocation(params: {
    tenantId: string;
    employeeId: string;
    leaveTypeId: string;
    year: number;
    allocated: number;
  }) {
    const { tenantId, employeeId, leaveTypeId, year, allocated } = params;
    return db.leaveBalance.upsert({
      where: {
        tenantId_employeeId_leaveTypeId_year: { tenantId, employeeId, leaveTypeId, year },
      },
      create: { tenantId, employeeId, leaveTypeId, year, allocated },
      update: { allocated },
    });
  },
};
