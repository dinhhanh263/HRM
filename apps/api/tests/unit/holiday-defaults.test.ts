import { describe, it, expect } from 'vitest';
import {
  vietnamHolidaysForYear,
  hasLunarHolidays,
} from '../../src/domain/timesheet/holiday-defaults.js';

// The lunar holidays (Tết, Giỗ Tổ Hùng Vương) shift each Gregorian year and are
// hand-maintained in a lookup table. These assert the table is correct for the
// covered years and that an uncovered year is reported as such instead of
// silently dropping Tết.

describe('vietnamHolidaysForYear', () => {
  it('always includes the 5 solar-fixed statutory holidays', () => {
    const dates = vietnamHolidaysForYear(2099).map((h) => h.date);
    expect(dates).toEqual([
      '2099-01-01',
      '2099-04-30',
      '2099-05-01',
      '2099-09-01',
      '2099-09-02',
    ]);
  });

  // Verified against the Vietnamese lunar calendar (Mùng 1 Tết + Giỗ Tổ 10/3 ÂL).
  const lunarExpectations: Record<number, { mung1: string; gioTo: string }> = {
    2026: { mung1: '2026-02-17', gioTo: '2026-04-26' },
    2027: { mung1: '2027-02-06', gioTo: '2027-04-16' },
    2028: { mung1: '2028-01-26', gioTo: '2028-04-04' },
    2029: { mung1: '2029-02-13', gioTo: '2029-04-23' },
    2030: { mung1: '2030-02-02', gioTo: '2030-04-12' },
  };

  for (const [year, { mung1, gioTo }] of Object.entries(lunarExpectations)) {
    it(`includes Tết and Giỗ Tổ for ${year}`, () => {
      const holidays = vietnamHolidaysForYear(Number(year));
      const dates = holidays.map((h) => h.date);
      expect(dates).toContain(mung1);
      expect(dates).toContain(gioTo);
      // 5 days of Tết Nguyên đán (incl. Giao thừa) + Giỗ Tổ.
      expect(holidays.filter((h) => h.name.includes('Tết Nguyên đán'))).toHaveLength(5);
    });
  }
});

describe('hasLunarHolidays', () => {
  it('is true for years present in the lunar table', () => {
    expect(hasLunarHolidays(2026)).toBe(true);
    expect(hasLunarHolidays(2030)).toBe(true);
  });

  it('is false for years outside the lunar table', () => {
    expect(hasLunarHolidays(2099)).toBe(false);
  });
});
