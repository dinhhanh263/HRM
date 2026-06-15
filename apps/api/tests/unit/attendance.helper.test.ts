import { describe, it, expect } from 'vitest';
import {
  resolveWorkDate,
  computeWorkedHours,
  monthRangeUtc,
  businessDay,
  businessMonthKey,
} from '../../src/domain/timesheet/attendance.helper.js';

describe('businessDay (GMT+7)', () => {
  it('keeps the same day during the daytime', () => {
    // 09:30 UTC = 16:30 GMT+7, still 2026-06-02
    expect(businessDay(new Date('2026-06-02T09:30:00.000Z')).toISOString()).toBe(
      '2026-06-02T00:00:00.000Z',
    );
  });

  it('rolls to the next day once GMT+7 has passed midnight', () => {
    // 20:00 UTC = 03:00 GMT+7 on 2026-06-03 — an early-morning check-in in Vietnam
    expect(businessDay(new Date('2026-06-02T20:00:00.000Z')).toISOString()).toBe(
      '2026-06-03T00:00:00.000Z',
    );
  });
});

describe('businessMonthKey (GMT+7)', () => {
  it('uses the GMT+7 month at a UTC month boundary', () => {
    // 2026-05-31 18:00 UTC = 2026-06-01 01:00 GMT+7 -> June
    expect(businessMonthKey(new Date('2026-05-31T18:00:00.000Z'))).toBe('2026-06');
  });
});

describe('resolveWorkDate', () => {
  const now = new Date('2026-06-02T09:30:00.000Z');

  it('should derive todays GMT+7 date when no value is given', () => {
    expect(resolveWorkDate(undefined, now).toISOString()).toBe('2026-06-02T00:00:00.000Z');
  });

  it('files an early-morning GMT+7 check-in under the local day, not the UTC day', () => {
    // 19:30 UTC = 02:30 GMT+7 on 2026-06-03
    const lateNight = new Date('2026-06-02T19:30:00.000Z');
    expect(resolveWorkDate(undefined, lateNight).toISOString()).toBe('2026-06-03T00:00:00.000Z');
  });

  it('should accept a past date at UTC midnight', () => {
    expect(resolveWorkDate('2026-05-30', now).toISOString()).toBe('2026-05-30T00:00:00.000Z');
  });

  it('should accept today explicitly', () => {
    expect(resolveWorkDate('2026-06-02', now).toISOString()).toBe('2026-06-02T00:00:00.000Z');
  });

  it('should reject a future date', () => {
    expect(() => resolveWorkDate('2026-06-03', now)).toThrow('Cannot record attendance for a future date');
  });

  it('should reject a malformed date', () => {
    expect(() => resolveWorkDate('02-06-2026', now)).toThrow('workDate must be in YYYY-MM-DD format');
  });

  it('should reject an impossible calendar date', () => {
    expect(() => resolveWorkDate('2026-02-30', now)).toThrow('workDate must be a valid calendar date');
  });
});

describe('monthRangeUtc', () => {
  it('should produce a half-open UTC range for a month', () => {
    const { start, end } = monthRangeUtc('2026-02');
    expect(start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('should roll over the year in December', () => {
    const { start, end } = monthRangeUtc('2026-12');
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('should reject a malformed month', () => {
    expect(() => monthRangeUtc('2026/02')).toThrow('month must be in YYYY-MM format');
  });

  it('should reject an out-of-range month', () => {
    expect(() => monthRangeUtc('2026-13')).toThrow('month must be between 01 and 12');
  });
});

describe('computeWorkedHours', () => {
  it('should compute whole hours', () => {
    const inAt = new Date('2026-06-02T01:00:00.000Z');
    const outAt = new Date('2026-06-02T09:00:00.000Z');
    expect(computeWorkedHours(inAt, outAt)).toBe(8);
  });

  it('should round to two decimals', () => {
    const inAt = new Date('2026-06-02T01:00:00.000Z');
    const outAt = new Date('2026-06-02T09:40:00.000Z'); // 8h40m = 8.666..
    expect(computeWorkedHours(inAt, outAt)).toBe(8.67);
  });

  it('should reject a checkout at or before check-in', () => {
    const inAt = new Date('2026-06-02T09:00:00.000Z');
    expect(() => computeWorkedHours(inAt, inAt)).toThrow('Check-out must be after check-in');
    expect(() => computeWorkedHours(inAt, new Date('2026-06-02T08:00:00.000Z'))).toThrow(
      'Check-out must be after check-in',
    );
  });
});
