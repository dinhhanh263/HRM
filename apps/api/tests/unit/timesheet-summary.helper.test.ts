import { describe, it, expect } from 'vitest';
import {
  buildTimesheetSummary,
  type BuildTimesheetSummaryInput,
} from '../../src/domain/timesheet/summary.helper.js';

// June 2026: 1st = Monday. Mon–Fri workdays. 30 days; 22 weekdays.
const MON_FRI = [1, 2, 3, 4, 5];

function utc(day: number): Date {
  return new Date(Date.UTC(2026, 5, day));
}

function baseInput(overrides: Partial<BuildTimesheetSummaryInput> = {}): BuildTimesheetSummaryInput {
  return {
    employeeId: 'emp-1',
    month: '2026-06',
    start: new Date(Date.UTC(2026, 5, 1)),
    end: new Date(Date.UTC(2026, 6, 1)),
    workdays: MON_FRI,
    holidays: [],
    attendance: [],
    leaves: [],
    overtime: [],
    ...overrides,
  };
}

describe('buildTimesheetSummary', () => {
  it('counts policy workdays in the month excluding weekends', () => {
    const s = buildTimesheetSummary(baseInput());
    expect(s.workingDaysInPeriod).toBe(22);
    expect(s.daysAbsent).toBe(22); // no attendance, no leave → all absent
    expect(s.daysPresent).toBe(0);
    expect(s.holidayCount).toBe(0);
  });

  it('excludes a holiday landing on a workday from working days and counts it', () => {
    // 2026-06-02 is a Tuesday.
    const s = buildTimesheetSummary(
      baseInput({ holidays: [{ date: utc(2), recurring: false }] }),
    );
    expect(s.workingDaysInPeriod).toBe(21);
    expect(s.holidayCount).toBe(1);
    expect(s.daysAbsent).toBe(21);
  });

  it('does not count a holiday that lands on a weekend', () => {
    // 2026-06-06 is a Saturday.
    const s = buildTimesheetSummary(
      baseInput({ holidays: [{ date: utc(6), recurring: false }] }),
    );
    expect(s.workingDaysInPeriod).toBe(22);
    expect(s.holidayCount).toBe(0);
  });

  it('classifies a working day with attendance as present', () => {
    const s = buildTimesheetSummary(
      baseInput({
        attendance: [
          { workDate: utc(1), workedHours: 8 },
          { workDate: utc(2), workedHours: 7.5 },
        ],
      }),
    );
    expect(s.daysPresent).toBe(2);
    expect(s.daysAbsent).toBe(20);
    expect(s.totalWorkedHours).toBe(15.5);
  });

  it('does not double-count approved leave as absence and splits paid vs unpaid', () => {
    const s = buildTimesheetSummary(
      baseInput({
        // 2026-06-03..04 paid leave (Wed/Thu); 2026-06-05 unpaid (Fri).
        leaves: [
          { startDate: utc(3), endDate: utc(4), paid: true },
          { startDate: utc(5), endDate: utc(5), paid: false },
        ],
      }),
    );
    expect(s.paidLeaveDays).toBe(2);
    expect(s.unpaidLeaveDays).toBe(1);
    expect(s.daysAbsent).toBe(22 - 3);
    // Partition invariant.
    expect(s.daysPresent + s.paidLeaveDays + s.unpaidLeaveDays + s.daysAbsent).toBe(
      s.workingDaysInPeriod,
    );
  });

  it('present takes precedence over leave on the same day (no double count)', () => {
    const s = buildTimesheetSummary(
      baseInput({
        attendance: [{ workDate: utc(3), workedHours: 8 }],
        leaves: [{ startDate: utc(3), endDate: utc(3), paid: true }],
      }),
    );
    expect(s.daysPresent).toBe(1);
    expect(s.paidLeaveDays).toBe(0);
    expect(s.daysPresent + s.paidLeaveDays + s.unpaidLeaveDays + s.daysAbsent).toBe(
      s.workingDaysInPeriod,
    );
  });

  it('clips leave spanning the month boundary to in-month working days', () => {
    // Leave from May 28 to June 2 (Tue). Only Jun 1 (Mon) + Jun 2 (Tue) are in-month workdays.
    const s = buildTimesheetSummary(
      baseInput({
        leaves: [{ startDate: new Date(Date.UTC(2026, 4, 28)), endDate: utc(2), paid: true }],
      }),
    );
    expect(s.paidLeaveDays).toBe(2);
  });

  it('groups approved overtime by category+night+multiplier and sums hours', () => {
    const s = buildTimesheetSummary(
      baseInput({
        overtime: [
          { category: 'OT_WEEKDAY', night: false, hours: 2, multiplier: 1.5 },
          { category: 'OT_WEEKDAY', night: false, hours: 3, multiplier: 1.5 },
          { category: 'OT_WEEKEND', night: true, hours: 4, multiplier: 2.7 },
        ],
      }),
    );
    expect(s.overtime).toHaveLength(2);
    const weekday = s.overtime.find((o) => o.category === 'OT_WEEKDAY' && !o.night);
    expect(weekday).toEqual({ category: 'OT_WEEKDAY', night: false, hours: 5, multiplier: 1.5 });
    const weekendNight = s.overtime.find((o) => o.category === 'OT_WEEKEND' && o.night);
    expect(weekendNight).toEqual({ category: 'OT_WEEKEND', night: true, hours: 4, multiplier: 2.7 });
  });

  it('keeps distinct multiplier snapshots in separate groups', () => {
    const s = buildTimesheetSummary(
      baseInput({
        overtime: [
          { category: 'OT_WEEKDAY', night: false, hours: 2, multiplier: 1.5 },
          { category: 'OT_WEEKDAY', night: false, hours: 2, multiplier: 1.8 },
        ],
      }),
    );
    expect(s.overtime).toHaveLength(2);
  });

  it('echoes employeeId and month', () => {
    const s = buildTimesheetSummary(baseInput());
    expect(s.employeeId).toBe('emp-1');
    expect(s.month).toBe('2026-06');
  });
});
