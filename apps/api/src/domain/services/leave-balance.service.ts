import { leaveTypeRepository } from '../repositories/leave-type.repository.js';
import { leaveBalanceRepository } from '../repositories/leave-balance.repository.js';
import { leaveRequestRepository } from '../repositories/leave-request.repository.js';
import { employeeRepository } from '../repositories/employee.repository.js';
import { NotFoundError } from '../../shared/errors/index.js';
import type { LeaveBalanceDto, LeaveTypeSummaryDto } from '@hrm/shared';

interface UsageEntry {
  used: number;
  pending: number;
}

export interface RosterBalances {
  /** Active leave types in a stable order — the roster's column set. */
  leaveTypes: LeaveTypeSummaryDto[];
  /** employeeId → balances, one entry per active leave type (same order). */
  balancesByEmployee: Map<string, LeaveBalanceDto[]>;
}

async function buildUsageMap(employeeId: string, year: number): Promise<Map<string, UsageEntry>> {
  const grouped = await leaveRequestRepository.aggregateDaysByStatus(employeeId, year);
  const usage = new Map<string, UsageEntry>();

  for (const row of grouped) {
    const entry = usage.get(row.leaveTypeId) ?? { used: 0, pending: 0 };
    const days = row._sum.totalDays ?? 0;
    if (row.status === 'APPROVED') entry.used += days;
    else if (row.status === 'PENDING') entry.pending += days;
    usage.set(row.leaveTypeId, entry);
  }

  return usage;
}

export const leaveBalanceService = {
  async getBalances(
    tenantId: string,
    employeeId: string,
    year: number,
  ): Promise<LeaveBalanceDto[]> {
    const [types, overrides, usage] = await Promise.all([
      leaveTypeRepository.findAll(tenantId, { activeOnly: true }),
      leaveBalanceRepository.findForEmployeeYear(employeeId, year),
      buildUsageMap(employeeId, year),
    ]);

    const overrideByType = new Map(overrides.map((o) => [o.leaveTypeId, o]));

    return types.map((type) => {
      const allocated = overrideByType.get(type.id)?.allocated ?? type.defaultDays;
      const { used, pending } = usage.get(type.id) ?? { used: 0, pending: 0 };

      return {
        leaveTypeId: type.id,
        leaveTypeName: type.name,
        leaveTypeCode: type.code,
        colorHex: type.colorHex,
        paid: type.paid,
        year,
        allocated,
        used,
        pending,
        remaining: allocated - used - pending,
      };
    });
  },

  /**
   * Roster view: compute balances for many employees at once (HR/Manager
   * overview). Uses exactly three queries regardless of the number of employees
   * — active types, allocation overrides, and usage aggregated by employee — so
   * it never degrades into an N+1 sweep. The caller is responsible for scoping
   * `employeeIds` (e.g. via employeeService row-level access).
   */
  async getRosterBalances(
    tenantId: string,
    employeeIds: string[],
    year: number,
  ): Promise<RosterBalances> {
    if (employeeIds.length === 0) {
      return { leaveTypes: [], balancesByEmployee: new Map() };
    }

    const [types, overrides, usageRows] = await Promise.all([
      leaveTypeRepository.findAll(tenantId, { activeOnly: true }),
      leaveBalanceRepository.findManyForEmployeesYear(employeeIds, year),
      leaveRequestRepository.aggregateDaysByStatusForEmployees(employeeIds, year),
    ]);

    // Index overrides + usage by employee for O(1) lookup while assembling rows.
    const overrideByEmployee = new Map<string, Map<string, number>>();
    for (const o of overrides) {
      const byType = overrideByEmployee.get(o.employeeId) ?? new Map<string, number>();
      byType.set(o.leaveTypeId, o.allocated);
      overrideByEmployee.set(o.employeeId, byType);
    }

    const usageByEmployee = new Map<string, Map<string, UsageEntry>>();
    for (const row of usageRows) {
      const byType = usageByEmployee.get(row.employeeId) ?? new Map<string, UsageEntry>();
      const entry = byType.get(row.leaveTypeId) ?? { used: 0, pending: 0 };
      const days = row._sum.totalDays ?? 0;
      if (row.status === 'APPROVED') entry.used += days;
      else if (row.status === 'PENDING') entry.pending += days;
      byType.set(row.leaveTypeId, entry);
      usageByEmployee.set(row.employeeId, byType);
    }

    const leaveTypes: LeaveTypeSummaryDto[] = types.map((type) => ({
      id: type.id,
      name: type.name,
      code: type.code,
      colorHex: type.colorHex,
      paid: type.paid,
    }));

    const balancesByEmployee = new Map<string, LeaveBalanceDto[]>();
    for (const employeeId of employeeIds) {
      const overrideByType = overrideByEmployee.get(employeeId);
      const usageByType = usageByEmployee.get(employeeId);

      balancesByEmployee.set(
        employeeId,
        types.map((type) => {
          const allocated = overrideByType?.get(type.id) ?? type.defaultDays;
          const { used, pending } = usageByType?.get(type.id) ?? { used: 0, pending: 0 };
          return {
            leaveTypeId: type.id,
            leaveTypeName: type.name,
            leaveTypeCode: type.code,
            colorHex: type.colorHex,
            paid: type.paid,
            year,
            allocated,
            used,
            pending,
            remaining: allocated - used - pending,
          };
        }),
      );
    }

    return { leaveTypes, balancesByEmployee };
  },

  /**
   * Set an HR-defined per-employee allocation override for a leave type in a
   * given year, then return the employee's recomputed balances for that year.
   * Both the employee and the leave type are validated against the tenant so a
   * caller can never write an override across tenant boundaries.
   */
  async setAllocation(
    tenantId: string,
    employeeId: string,
    leaveTypeId: string,
    year: number,
    allocated: number,
  ): Promise<LeaveBalanceDto[]> {
    const [employee, leaveType] = await Promise.all([
      employeeRepository.findById(employeeId, tenantId),
      leaveTypeRepository.findById(leaveTypeId, tenantId),
    ]);
    if (!employee) throw new NotFoundError('Employee not found');
    if (!leaveType) throw new NotFoundError('Leave type not found');

    await leaveBalanceRepository.upsertAllocation({
      tenantId,
      employeeId,
      leaveTypeId,
      year,
      allocated,
    });

    return this.getBalances(tenantId, employeeId, year);
  },
};
