import { BadRequestError } from '../../shared/errors/index.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Business timezone offset: GMT+7 (Asia/Ho_Chi_Minh — no DST). */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * The GMT+7 calendar day of an instant, expressed as a UTC-midnight Date that
 * serves purely as a tz-agnostic date label. The work day is anchored to the
 * employee's local (Vietnam) day, not UTC, so an early-morning check-in is
 * filed under the correct local date rather than slipping to the previous day.
 */
export function businessDay(now: Date = new Date()): Date {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()));
}

/** The GMT+7 current month of an instant as a YYYY-MM key. */
export function businessMonthKey(now: Date = new Date()): string {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Resolve the work date for an attendance action as a UTC-midnight Date label.
 * When no value is supplied, derives today's GMT+7 date from `now`. A supplied
 * date is validated for format and calendar validity, and may not be in the
 * future relative to the GMT+7 day.
 */
export function resolveWorkDate(value: string | undefined, now: Date = new Date()): Date {
  const today = businessDay(now);

  if (value === undefined) {
    return today;
  }

  if (!DATE_RE.test(value)) {
    throw new BadRequestError('workDate must be in YYYY-MM-DD format');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new BadRequestError('workDate must be a valid calendar date');
  }
  if (parsed.getTime() > today.getTime()) {
    throw new BadRequestError('Cannot record attendance for a future date');
  }
  return parsed;
}

const MONTH_RE = /^\d{4}-\d{2}$/;

/** Half-open UTC range [start, end) covering the given YYYY-MM month. */
export function monthRangeUtc(month: string): { start: Date; end: Date } {
  if (!MONTH_RE.test(month)) {
    throw new BadRequestError('month must be in YYYY-MM format');
  }
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  if (m < 1 || m > 12) {
    throw new BadRequestError('month must be between 01 and 12');
  }
  return {
    start: new Date(Date.UTC(year, m - 1, 1)),
    end: new Date(Date.UTC(year, m, 1)),
  };
}

/** Hours between check-in and check-out, rounded to two decimals. */
export function computeWorkedHours(checkInAt: Date, checkOutAt: Date): number {
  if (checkOutAt.getTime() <= checkInAt.getTime()) {
    throw new BadRequestError('Check-out must be after check-in');
  }
  const hours = (checkOutAt.getTime() - checkInAt.getTime()) / 3_600_000;
  return Math.round(hours * 100) / 100;
}
