import type { OvertimeCategory, OvertimeCapWarning } from '@hrm/shared';

export interface HolidayMatch {
  date: Date; // UTC-midnight @db.Date value
  recurring: boolean;
}

// BLLĐ 2019 Điều 107 overtime ceilings (advisory at approval, never hard-blocked).
export const OT_CAP_MONTH_HOURS = 40;
export const OT_CAP_YEAR_HOURS = 200;

// The multiplier inputs we pull from the tenant's timesheet policy. Kept as a
// narrow shape so the helper stays pure and unit-testable without the full DTO.
export interface OvertimeMultiplierPolicy {
  otWeekday: number;
  otWeekend: number;
  otHoliday: number;
  nightExtra: number;
  nightOtExtra: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * True when `date` falls on a holiday in the calendar. Recurring holidays match
 * by month+day across years (fixed solar dates like 30/4, 1/5, 2/9); one-off
 * holidays match the exact date. All comparisons are in UTC to stay aligned with
 * how @db.Date values are stored.
 */
export function isHolidayDate(date: Date, holidays: HolidayMatch[]): boolean {
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  return holidays.some((h) =>
    h.recurring
      ? h.date.getUTCMonth() === month && h.date.getUTCDate() === day
      : h.date.getUTCFullYear() === date.getUTCFullYear() &&
        h.date.getUTCMonth() === month &&
        h.date.getUTCDate() === day,
  );
}

/**
 * Derive the overtime category for a work date from the tenant's policy workdays
 * and holiday calendar. A holiday match overrides weekday/weekend classification.
 *
 * Security: the category is always computed here from server-held policy + the
 * holiday calendar — never trusted from the client — because it drives the pay
 * multiplier consumed by payroll.
 */
export function deriveOvertimeCategory(
  workDate: Date,
  workdays: number[],
  holidays: HolidayMatch[],
): OvertimeCategory {
  if (isHolidayDate(workDate, holidays)) {
    return 'OT_HOLIDAY';
  }
  if (!workdays.includes(workDate.getUTCDay())) {
    return 'OT_WEEKEND';
  }
  return 'OT_WEEKDAY';
}

/**
 * Compute the effective pay multiplier for an overtime block from the tenant's
 * policy. Day-shift rates are the plain Điều 98 minimums (weekday/weekend/
 * holiday). Night OT follows NĐ 145/2020 Art 57:
 *
 *   multiplier = base + nightExtra + nightOtExtra × dayUnitRate
 *
 * where `dayUnitRate` is 1.0 for a weekday and the day OT rate otherwise — i.e.
 * the night-OT extra is charged on top of the (already elevated) weekend/holiday
 * unit. With the seeded VN defaults this yields weekday-night 2.0, weekend-night
 * 2.7, holiday-night 3.9, all ≥ legal minimums.
 *
 * Snapshotted at approval so later policy edits never retroactively change pay.
 */
export function computeOvertimeMultiplier(
  category: OvertimeCategory,
  night: boolean,
  policy: OvertimeMultiplierPolicy,
): number {
  const base =
    category === 'OT_HOLIDAY'
      ? policy.otHoliday
      : category === 'OT_WEEKEND'
        ? policy.otWeekend
        : policy.otWeekday;
  if (!night) {
    return round2(base);
  }
  const dayUnitRate = category === 'OT_WEEKDAY' ? 1.0 : base;
  return round2(base + policy.nightExtra + policy.nightOtExtra * dayUnitRate);
}

/**
 * Advisory cap check against the BLLĐ monthly/yearly OT ceilings. Returns a
 * warning per breached scope; empty when within limits. Never blocks approval —
 * the reviewer decides.
 */
export function overtimeCapWarnings(monthHours: number, yearHours: number): OvertimeCapWarning[] {
  const warnings: OvertimeCapWarning[] = [];
  if (monthHours > OT_CAP_MONTH_HOURS) {
    warnings.push({ scope: 'month', limit: OT_CAP_MONTH_HOURS, total: monthHours });
  }
  if (yearHours > OT_CAP_YEAR_HOURS) {
    warnings.push({ scope: 'year', limit: OT_CAP_YEAR_HOURS, total: yearHours });
  }
  return warnings;
}
