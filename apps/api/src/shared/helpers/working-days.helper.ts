/**
 * Count working days (Mon–Fri) between two dates, inclusive.
 * Public holidays are out of scope for the MVP. A half-day single-day request
 * counts as 0.5. Dates are compared by calendar day in UTC.
 */
export function countWorkingDays(start: Date, end: Date, halfDay = false): number {
  const s = toUtcMidnight(start);
  const e = toUtcMidnight(end);

  if (e < s) return 0;

  if (halfDay && s.getTime() === e.getTime()) {
    return isWeekday(s) ? 0.5 : 0;
  }

  let count = 0;
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    if (isWeekday(d)) count += 1;
  }
  return count;
}

function toUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isWeekday(date: Date): boolean {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}
