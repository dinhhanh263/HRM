import { leaveSettingsService } from './leave-settings.service.js';
import { leaveTypeRepository } from '../repositories/leave-type.repository.js';
import { leaveBalanceRepository } from '../repositories/leave-balance.repository.js';
import { computeProratedDays } from '../leave/leave-allocation.helper.js';

export const leaveAllocationService = {
  /**
   * Seeds pro-rated first-year leave allocations for a newly created employee.
   *
   * No-op when the tenant pro-rata toggle is off or no joinDate is supplied. When
   * active, writes one allocation override per active leave type with
   * `defaultDays > 0`, pro-rated for the employee's join year. Idempotent thanks
   * to `upsertAllocation`'s unique key, so re-running never duplicates rows.
   *
   * Callers should treat this as best-effort and not let a failure here roll back
   * the employee creation (balances are recomputable) — see the create/import hooks.
   */
  async seedProratedAllocations(
    tenantId: string,
    employeeId: string,
    joinDate: Date | null | undefined,
  ): Promise<void> {
    if (!joinDate) {
      return;
    }

    const { proRataEnabled } = await leaveSettingsService.getProRata(tenantId);
    if (!proRataEnabled) {
      return;
    }

    const year = joinDate.getUTCFullYear();
    const types = await leaveTypeRepository.findAll(tenantId, { activeOnly: true });

    for (const type of types) {
      if (type.defaultDays <= 0) {
        continue;
      }
      const allocated = computeProratedDays(type.defaultDays, joinDate, year);
      await leaveBalanceRepository.upsertAllocation({
        tenantId,
        employeeId,
        leaveTypeId: type.id,
        year,
        allocated,
      });
    }
  },
};
