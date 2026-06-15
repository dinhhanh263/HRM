import { describe, it, expect } from 'vitest';
import { countWorkingDays } from '../../src/shared/helpers/working-days.helper.js';

const d = (iso: string) => new Date(iso);

describe('countWorkingDays', () => {
  it('counts a single weekday as 1', () => {
    // 2026-06-01 is a Monday
    expect(countWorkingDays(d('2026-06-01'), d('2026-06-01'))).toBe(1);
  });

  it('returns 0.5 for a half-day on a weekday', () => {
    expect(countWorkingDays(d('2026-06-01'), d('2026-06-01'), true)).toBe(0.5);
  });

  it('excludes weekends across a full week', () => {
    // Mon 2026-06-01 .. Sun 2026-06-07 → 5 working days
    expect(countWorkingDays(d('2026-06-01'), d('2026-06-07'))).toBe(5);
  });

  it('returns 0 for a single weekend day', () => {
    // 2026-06-06 is a Saturday
    expect(countWorkingDays(d('2026-06-06'), d('2026-06-06'))).toBe(0);
  });

  it('returns 0 when end is before start', () => {
    expect(countWorkingDays(d('2026-06-07'), d('2026-06-01'))).toBe(0);
  });

  it('ignores half-day flag for multi-day ranges', () => {
    expect(countWorkingDays(d('2026-06-01'), d('2026-06-02'), true)).toBe(2);
  });
});
