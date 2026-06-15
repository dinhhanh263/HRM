import type {
  OvertimeCategory,
  TimesheetSummaryDto,
  TimesheetSummaryOvertimeDto,
} from '@hrm/shared';
import { isHolidayDate, type HolidayMatch } from './overtime.helper.js';

export interface SummaryAttendanceInput {
  workDate: Date;
  workedHours: number | null;
}

// An APPROVED leave covering [startDate, endDate] (inclusive). `paid` comes from
// the leave type so the summary can split paid vs unpaid days for payroll.
export interface SummaryLeaveInput {
  startDate: Date;
  endDate: Date;
  paid: boolean;
}

// An APPROVED overtime block with its snapshotted multiplier.
export interface SummaryOvertimeInput {
  category: OvertimeCategory;
  night: boolean;
  hours: number;
  multiplier: number | null;
}

export interface BuildTimesheetSummaryInput {
  employeeId: string;
  month: string; // YYYY-MM
  start: Date; // month start, UTC midnight
  end: Date; // first day of next month, UTC midnight (exclusive)
  workdays: number[]; // policy workdays, 0=Sun..6=Sat
  holidays: HolidayMatch[];
  attendance: SummaryAttendanceInput[];
  leaves: SummaryLeaveInput[]; // APPROVED only
  overtime: SummaryOvertimeInput[]; // APPROVED only
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

function toUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Build the deterministic, side-effect-free per-employee/month attendance summary
 * that Payroll consumes. Classification runs at whole-day granularity over the
 * policy working days in the month, excluding holidays. Each working day falls
 * into exactly one bucket so the partition always holds:
 *
 *   daysPresent + paidLeaveDays + unpaidLeaveDays + daysAbsent === workingDaysInPeriod
 *
 * Precedence per working day: attendance (present) > approved leave (paid/unpaid
 * by leave type) > absent. Half-day leave is recorded at whole-day granularity
 * here; the fractional balance accounting is the Leave module's responsibility.
 * A holiday that lands on a policy workday is a paid day off — excluded from
 * working days and counted in holidayCount instead.
 */
export function buildTimesheetSummary(input: BuildTimesheetSummaryInput): TimesheetSummaryDto {
  const attendanceDays = new Set(input.attendance.map((a) => dayKey(a.workDate)));
  const leaves = input.leaves.map((l) => ({
    start: toUtcMidnight(l.startDate),
    end: toUtcMidnight(l.endDate),
    paid: l.paid,
  }));

  let workingDaysInPeriod = 0;
  let daysPresent = 0;
  let daysAbsent = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let holidayCount = 0;

  for (let d = new Date(input.start); d < input.end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (!input.workdays.includes(d.getUTCDay())) {
      continue; // non-working weekday-of-week (e.g. weekend) — outside the partition
    }
    if (isHolidayDate(d, input.holidays)) {
      holidayCount += 1;
      continue; // paid day off, not a working day
    }

    workingDaysInPeriod += 1;
    if (attendanceDays.has(dayKey(d))) {
      daysPresent += 1;
      continue;
    }
    const time = d.getTime();
    const leave = leaves.find((l) => time >= l.start.getTime() && time <= l.end.getTime());
    if (leave) {
      if (leave.paid) paidLeaveDays += 1;
      else unpaidLeaveDays += 1;
      continue;
    }
    daysAbsent += 1;
  }

  const totalWorkedHours = round2(
    input.attendance.reduce((sum, a) => sum + (a.workedHours ?? 0), 0),
  );

  return {
    employeeId: input.employeeId,
    month: input.month,
    workingDaysInPeriod,
    daysPresent,
    daysAbsent,
    paidLeaveDays,
    unpaidLeaveDays,
    holidayCount,
    totalWorkedHours,
    overtime: groupOvertime(input.overtime),
  };
}

// Group approved OT by category + night + snapshotted multiplier. Distinct
// multiplier snapshots stay in separate groups so a later policy edit never
// blends two differently-paid blocks. Sorted for deterministic output.
function groupOvertime(overtime: SummaryOvertimeInput[]): TimesheetSummaryOvertimeDto[] {
  const groups = new Map<string, TimesheetSummaryOvertimeDto>();
  for (const ot of overtime) {
    const multiplier = ot.multiplier ?? 0;
    const key = `${ot.category}|${ot.night}|${multiplier}`;
    const existing = groups.get(key);
    if (existing) {
      existing.hours = round2(existing.hours + ot.hours);
    } else {
      groups.set(key, {
        category: ot.category,
        night: ot.night,
        hours: round2(ot.hours),
        multiplier,
      });
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      Number(a.night) - Number(b.night) ||
      a.multiplier - b.multiplier,
  );
}
