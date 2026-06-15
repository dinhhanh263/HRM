import type { AttendanceRecordDto, HolidayDto, TimesheetPolicyDto } from '@hrm/shared';

export type DayStatus = 'present' | 'absent' | 'weekend' | 'holiday' | 'upcoming' | 'leave';

export interface CalendarDay {
  /** YYYY-MM-DD */
  date: string;
  dayOfMonth: number;
  /** JS getUTCDay convention: 0=Sun..6=Sat */
  weekday: number;
  inMonth: boolean;
  status: DayStatus;
  record?: AttendanceRecordDto;
  holidayName?: string;
}

/** Business timezone offset: GMT+7 (Asia/Ho_Chi_Minh — no DST). */
const VN_TZ = 'Asia/Ho_Chi_Minh';
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** An instant shifted so its UTC components read as GMT+7 wall-clock. */
function toBusinessClock(d: Date): Date {
  return new Date(d.getTime() + VN_OFFSET_MS);
}

/** Current month as YYYY-MM in GMT+7. */
export function currentMonthKey(now: Date = new Date()): string {
  const vn = toBusinessClock(now);
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Today as YYYY-MM-DD in GMT+7 — the employee's local business day. */
export function currentDateKey(now: Date = new Date()): string {
  return isoDate(toBusinessClock(now));
}

/** Shift a YYYY-MM key by a number of months, staying in UTC. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Render an ISO datetime as HH:mm in the business timezone (GMT+7). */
export function formatTime(iso: string | null, lng: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(lng === 'vi' ? 'vi-VN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: VN_TZ,
  }).format(new Date(iso));
}

/** Render a YYYY-MM-DD as a localized long date (UTC, no day drift). */
export function formatDate(iso: string, lng: string): string {
  return new Intl.DateTimeFormat(lng === 'vi' ? 'vi-VN' : 'en-US', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00.000Z`));
}

/** Render an ISO datetime as dd/MM/yyyy HH:mm in the business timezone (GMT+7). */
export function formatDateTime(iso: string, lng: string): string {
  return new Intl.DateTimeFormat(lng === 'vi' ? 'vi-VN' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: VN_TZ,
  }).format(new Date(iso));
}

/** Render a YYYY-MM key as a localized month + year title. */
export function formatMonthTitle(month: string, lng: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(lng === 'vi' ? 'vi-VN' : 'en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

interface BuildCalendarArgs {
  month: string;
  records: AttendanceRecordDto[];
  workdays: number[];
  holidays: Map<string, string>;
  /** Reference "today" for past/upcoming classification. */
  now?: Date;
}

/**
 * Build a 6-week (42-cell) calendar grid for `month`, Monday-first, classifying
 * each in-month day against the tenant's workdays, holiday calendar and the
 * employee's attendance records. Leading/trailing cells fill the grid.
 */
export function buildCalendar({
  month,
  records,
  workdays,
  holidays,
  now = new Date(),
}: BuildCalendarArgs): CalendarDay[] {
  const [year, m] = month.split('-').map(Number);
  const firstOfMonth = new Date(Date.UTC(year, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const todayKey = currentDateKey(now);

  const byDate = new Map(records.map((r) => [r.workDate, r]));
  const workdaySet = new Set(workdays);

  // Monday-first offset: JS getUTCDay 0=Sun..6=Sat -> 0=Mon..6=Sun.
  const firstWeekday = (firstOfMonth.getUTCDay() + 6) % 7;

  const cells: CalendarDay[] = [];
  for (let i = 0; i < 42; i++) {
    const offset = i - firstWeekday;
    const cellDate = new Date(Date.UTC(year, m - 1, 1 + offset));
    const key = isoDate(cellDate);
    const inMonth = offset >= 0 && offset < daysInMonth;
    const weekday = cellDate.getUTCDay();
    const record = byDate.get(key);
    const holidayName = holidays.get(key);

    let status: DayStatus;
    if (record?.checkInAt) {
      status = 'present';
    } else if (holidayName) {
      status = 'holiday';
    } else if (!workdaySet.has(weekday)) {
      status = 'weekend';
    } else if (key > todayKey) {
      status = 'upcoming';
    } else {
      status = 'absent';
    }

    cells.push({
      date: key,
      dayOfMonth: cellDate.getUTCDate(),
      weekday,
      inMonth,
      status,
      record,
      holidayName,
    });
  }
  return cells;
}

export function policyWorkdays(policy: TimesheetPolicyDto | undefined): number[] {
  return policy?.workdays ?? [1, 2, 3, 4, 5];
}

/**
 * Role-adaptive landing tab. A reviewer (MANAGER/HR — anyone granted
 * `timesheet:update`) lands on their team; everyone else on their own
 * self-service view. Capability-driven, so it stays aligned with the
 * server-side RBAC rather than branching on a role string.
 */
export function defaultTimesheetTab(canReview: boolean): 'mine' | 'team' {
  return canReview ? 'team' : 'mine';
}

/**
 * Find the holiday a YYYY-MM-DD work-date falls on, or undefined. Mirrors the
 * server rule (overtime.helper.isHolidayDate): recurring holidays match by
 * month+day across years (fixed solar dates like 30/4, 1/5, 2/9); one-off
 * holidays match the exact date. Comparison is purely on the date string so it
 * stays free of timezone drift.
 */
export function isHolidayMatch(
  dateISO: string,
  holidays: HolidayDto[] | undefined,
): HolidayDto | undefined {
  if (!dateISO) return undefined;
  const day = dateISO.slice(0, 10);
  const monthDay = day.slice(5);
  return holidays?.find((h) => {
    const hDay = h.date.slice(0, 10);
    return h.recurring ? hDay.slice(5) === monthDay : hDay === day;
  });
}

export type RestDayKind = 'holiday' | 'weekend';

export interface RestDayInfo {
  kind: RestDayKind;
  /** Present only when kind === 'holiday'. */
  holiday?: HolidayDto;
}

/**
 * Classify a YYYY-MM-DD as a paid rest day on which attendance shouldn't be
 * recorded (per Điều 112 BLLĐ — holidays/weekly rest are paid days off; any work
 * is compensated only through an approved overtime request, never auto-logged).
 * A holiday takes precedence over a weekend so the higher OT rate (≥300% vs
 * ≥200%) and the holiday name surface. Returns undefined on an ordinary workday.
 */
export function restDayInfo(
  dateISO: string,
  holidays: HolidayDto[] | undefined,
  workdays: number[],
): RestDayInfo | undefined {
  if (!dateISO) return undefined;
  const holiday = isHolidayMatch(dateISO, holidays);
  if (holiday) return { kind: 'holiday', holiday };
  const weekday = new Date(`${dateISO.slice(0, 10)}T00:00:00.000Z`).getUTCDay();
  if (!workdays.includes(weekday)) return { kind: 'weekend' };
  return undefined;
}
