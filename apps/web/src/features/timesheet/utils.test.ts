import { describe, it, expect } from 'vitest';
import type { HolidayDto } from '@hrm/shared';
import {
  defaultTimesheetTab,
  formatTime,
  currentMonthKey,
  currentDateKey,
  isHolidayMatch,
  restDayInfo,
} from './utils';

function holiday(date: string, name: string, recurring: boolean): HolidayDto {
  return {
    id: date,
    tenantId: 't1',
    date,
    name,
    recurring,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('defaultTimesheetTab', () => {
  it('opens reviewers on the team tab — their most relevant view', () => {
    expect(defaultTimesheetTab(true)).toBe('team');
  });

  it('opens non-reviewers (EMPLOYEE) on their own self-service tab', () => {
    expect(defaultTimesheetTab(false)).toBe('mine');
  });
});

describe('formatTime (GMT+7)', () => {
  it('renders a UTC instant as the GMT+7 wall-clock time', () => {
    // 08:00 UTC is 15:00 in Vietnam — what the employee actually clocked
    expect(formatTime('2026-06-02T08:00:00.000Z', 'vi')).toBe('15:00');
  });

  it('shows a dash when there is no time', () => {
    expect(formatTime(null, 'vi')).toBe('—');
  });
});

describe('currentDateKey / currentMonthKey (GMT+7)', () => {
  it('rolls to the next GMT+7 day after UTC 17:00', () => {
    // 18:00 UTC on 2026-06-02 = 01:00 GMT+7 on 2026-06-03
    expect(currentDateKey(new Date('2026-06-02T18:00:00.000Z'))).toBe('2026-06-03');
  });

  it('uses the GMT+7 month at a UTC month boundary', () => {
    expect(currentMonthKey(new Date('2026-05-31T18:00:00.000Z'))).toBe('2026-06');
  });
});

describe('isHolidayMatch', () => {
  const holidays: HolidayDto[] = [
    holiday('2026-09-02', 'Quốc khánh', true), // recurring fixed-date
    holiday('2026-02-17', 'Tết Nguyên đán', false), // one-off lunar date
  ];

  it('matches a fixed recurring holiday (National Day)', () => {
    expect(isHolidayMatch('2026-09-02', holidays)?.name).toBe('Quốc khánh');
  });

  it('matches a recurring holiday in a different year by month+day', () => {
    expect(isHolidayMatch('2030-09-02', holidays)?.name).toBe('Quốc khánh');
  });

  it('matches a one-off (non-recurring) holiday only on the exact date', () => {
    expect(isHolidayMatch('2026-02-17', holidays)?.name).toBe('Tết Nguyên đán');
    // Same month+day in another year must NOT match a non-recurring holiday.
    expect(isHolidayMatch('2027-02-17', holidays)).toBeUndefined();
  });

  it('returns undefined for an ordinary working day', () => {
    expect(isHolidayMatch('2026-06-15', holidays)).toBeUndefined();
  });

  it('handles undefined / empty calendars safely', () => {
    expect(isHolidayMatch('2026-09-02', undefined)).toBeUndefined();
    expect(isHolidayMatch('2026-09-02', [])).toBeUndefined();
  });
});

describe('restDayInfo', () => {
  // 2026-09-02 (National Day) is a Wednesday — a workday but for the holiday.
  // 2026-06-06 is a Saturday, 2026-06-07 a Sunday, 2026-06-05 a Friday.
  const workdays = [1, 2, 3, 4, 5]; // Mon–Fri
  const holidays: HolidayDto[] = [holiday('2026-09-02', 'Quốc khánh', true)];

  it('flags a holiday as a rest day and carries the holiday through', () => {
    const info = restDayInfo('2026-09-02', holidays, workdays);
    expect(info?.kind).toBe('holiday');
    expect(info?.holiday?.name).toBe('Quốc khánh');
  });

  it('flags a non-workday (weekend) as a rest day', () => {
    expect(restDayInfo('2026-06-06', [], workdays)?.kind).toBe('weekend'); // Sat
    expect(restDayInfo('2026-06-07', [], workdays)?.kind).toBe('weekend'); // Sun
  });

  it('prefers holiday over weekend when a holiday lands on a non-workday', () => {
    // National Day pinned to a Saturday-style off day: holiday wins (≥300% > ≥200%).
    const sat = [holiday('2026-06-06', 'Ngày lễ test', false)];
    expect(restDayInfo('2026-06-06', sat, workdays)?.kind).toBe('holiday');
  });

  it('returns undefined on an ordinary workday', () => {
    expect(restDayInfo('2026-06-05', [], workdays)).toBeUndefined(); // Fri
  });

  it('returns undefined for an empty date', () => {
    expect(restDayInfo('', holidays, workdays)).toBeUndefined();
  });
});
