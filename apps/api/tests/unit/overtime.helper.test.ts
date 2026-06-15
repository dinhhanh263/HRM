import { describe, it, expect } from 'vitest';
import {
  deriveOvertimeCategory,
  computeOvertimeMultiplier,
  overtimeCapWarnings,
  OT_CAP_MONTH_HOURS,
  OT_CAP_YEAR_HOURS,
} from '../../src/domain/timesheet/overtime.helper.js';

const WORKDAYS = [1, 2, 3, 4, 5]; // Mon–Fri
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

// Mirrors the seeded VN defaults (Điều 98 BLLĐ 2019 minimums).
const POLICY = {
  otWeekday: 1.5,
  otWeekend: 2.0,
  otHoliday: 3.0,
  nightExtra: 0.3,
  nightOtExtra: 0.2,
};

describe('deriveOvertimeCategory', () => {
  it('should return OT_WEEKDAY for a workday with no holiday', () => {
    // 2026-06-03 is a Wednesday (getUTCDay 3)
    expect(deriveOvertimeCategory(utc('2026-06-03'), WORKDAYS, [])).toBe('OT_WEEKDAY');
  });

  it('should return OT_WEEKEND for a day outside the policy workdays', () => {
    // 2026-06-06 is a Saturday (getUTCDay 6)
    expect(deriveOvertimeCategory(utc('2026-06-06'), WORKDAYS, [])).toBe('OT_WEEKEND');
  });

  it('should return OT_HOLIDAY for an exact-date (one-off) holiday', () => {
    const holidays = [{ date: utc('2026-09-02'), recurring: false }];
    expect(deriveOvertimeCategory(utc('2026-09-02'), WORKDAYS, holidays)).toBe('OT_HOLIDAY');
  });

  it('should let a holiday override weekend classification', () => {
    // 2026-09-06 is a Sunday but flagged as a holiday
    const holidays = [{ date: utc('2026-09-06'), recurring: false }];
    expect(deriveOvertimeCategory(utc('2026-09-06'), WORKDAYS, holidays)).toBe('OT_HOLIDAY');
  });

  it('should match a recurring holiday by month+day across years', () => {
    // recurring holiday seeded in 2025 must still match the 2026 work date
    const holidays = [{ date: utc('2025-04-30'), recurring: true }];
    expect(deriveOvertimeCategory(utc('2026-04-30'), WORKDAYS, holidays)).toBe('OT_HOLIDAY');
  });

  it('should NOT match a one-off holiday from a different year', () => {
    const holidays = [{ date: utc('2025-09-02'), recurring: false }];
    // 2026-09-02 is a Wednesday → plain weekday, not a holiday
    expect(deriveOvertimeCategory(utc('2026-09-02'), WORKDAYS, holidays)).toBe('OT_WEEKDAY');
  });
});

describe('computeOvertimeMultiplier', () => {
  // Day-shift rates are the plain Điều 98 minimums.
  it('should return the weekday rate for daytime weekday OT', () => {
    expect(computeOvertimeMultiplier('OT_WEEKDAY', false, POLICY)).toBe(1.5);
  });

  it('should return the weekend rate for daytime weekend OT', () => {
    expect(computeOvertimeMultiplier('OT_WEEKEND', false, POLICY)).toBe(2.0);
  });

  it('should return the holiday rate for daytime holiday OT', () => {
    expect(computeOvertimeMultiplier('OT_HOLIDAY', false, POLICY)).toBe(3.0);
  });

  // Night OT per NĐ 145/2020 Art 57: base + nightExtra + nightOtExtra × dayUnitRate.
  // dayUnitRate is 1.0 for weekday, otherwise the day OT rate.
  it('should add night premium + night-OT extra for weekday night OT', () => {
    // 1.5 + 0.3 + 0.2 × 1.0 = 2.0
    expect(computeOvertimeMultiplier('OT_WEEKDAY', true, POLICY)).toBe(2.0);
  });

  it('should base the weekend night-OT extra on the weekend day rate', () => {
    // 2.0 + 0.3 + 0.2 × 2.0 = 2.7
    expect(computeOvertimeMultiplier('OT_WEEKEND', true, POLICY)).toBe(2.7);
  });

  it('should base the holiday night-OT extra on the holiday day rate', () => {
    // 3.0 + 0.3 + 0.2 × 3.0 = 3.9
    expect(computeOvertimeMultiplier('OT_HOLIDAY', true, POLICY)).toBe(3.9);
  });
});

describe('overtimeCapWarnings', () => {
  it('should return no warnings when both totals are under the caps', () => {
    expect(overtimeCapWarnings(20, 120)).toEqual([]);
  });

  it('should return no warnings exactly at the caps', () => {
    expect(overtimeCapWarnings(OT_CAP_MONTH_HOURS, OT_CAP_YEAR_HOURS)).toEqual([]);
  });

  it('should warn when the monthly total exceeds the cap', () => {
    const warnings = overtimeCapWarnings(41, 120);
    expect(warnings).toEqual([{ scope: 'month', limit: OT_CAP_MONTH_HOURS, total: 41 }]);
  });

  it('should warn when the yearly total exceeds the cap', () => {
    const warnings = overtimeCapWarnings(20, 201);
    expect(warnings).toEqual([{ scope: 'year', limit: OT_CAP_YEAR_HOURS, total: 201 }]);
  });

  it('should warn on both scopes when both caps are exceeded', () => {
    const warnings = overtimeCapWarnings(41, 201);
    expect(warnings).toEqual([
      { scope: 'month', limit: OT_CAP_MONTH_HOURS, total: 41 },
      { scope: 'year', limit: OT_CAP_YEAR_HOURS, total: 201 },
    ]);
  });
});
