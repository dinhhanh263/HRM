import { attendanceRepository } from '../repositories/attendance.repository.js';
import { overtimeRepository } from '../repositories/overtime.repository.js';
import { leaveRequestRepository } from '../repositories/leave-request.repository.js';
import { holidayRepository } from '../repositories/holiday.repository.js';
import { timesheetPolicyService } from './timesheet-policy.service.js';
import { monthRangeUtc } from '../timesheet/attendance.helper.js';
import { buildTimesheetSummary } from '../timesheet/summary.helper.js';
import type { TimesheetSummaryDto } from '@hrm/shared';

export const timesheetSummaryService = {
  /**
   * Deterministic per-employee/month attendance summary — the stable contract
   * Payroll consumes. Side-effect-free: it only reads. The caller (controller)
   * is responsible for RBAC scope, i.e. that `employeeId` is the requester's own
   * record or one the requester is allowed to review.
   */
  async getSummary(
    tenantId: string,
    employeeId: string,
    month: string,
  ): Promise<TimesheetSummaryDto> {
    const { start, end } = monthRangeUtc(month);
    const year = start.getUTCFullYear();

    const [policy, holidays, attendance, leaves, overtime] = await Promise.all([
      timesheetPolicyService.getPolicy(tenantId),
      holidayRepository.findByYear(tenantId, year),
      attendanceRepository.findByEmployeeAndRange(tenantId, employeeId, start, end),
      leaveRequestRepository.findApprovedInRange(tenantId, employeeId, start, end),
      overtimeRepository.findApprovedInRange(tenantId, employeeId, start, end),
    ]);

    return buildTimesheetSummary({
      employeeId,
      month,
      start,
      end,
      workdays: policy.workdays,
      holidays: holidays.map((h) => ({ date: h.date, recurring: h.recurring })),
      attendance: attendance.map((a) => ({ workDate: a.workDate, workedHours: a.workedHours })),
      leaves: leaves.map((l) => ({
        startDate: l.startDate,
        endDate: l.endDate,
        paid: l.leaveType.paid,
      })),
      overtime: overtime.map((o) => ({
        category: o.category,
        night: o.night,
        hours: o.hours,
        multiplier: o.multiplier,
      })),
    });
  },
};
