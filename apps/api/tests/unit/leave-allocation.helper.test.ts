import { describe, it, expect } from 'vitest';
import { computeProratedDays } from '../../src/domain/leave/leave-allocation.helper.js';

// joinDate uses UTC; build helper for clarity.
const d = (iso: string) => new Date(iso);

describe('computeProratedDays', () => {
  it('grants the full allocation for a January join (12 months)', () => {
    expect(computeProratedDays(12, d('2026-01-01T00:00:00.000Z'), 2026)).toBe(12);
  });

  it('counts the join month inclusively (Nov join → 2 months)', () => {
    expect(computeProratedDays(12, d('2026-11-15T00:00:00.000Z'), 2026)).toBe(2);
  });

  it('December join → 1 month', () => {
    expect(computeProratedDays(12, d('2026-12-20T00:00:00.000Z'), 2026)).toBe(1);
  });

  it('August join → 5 months → 5 days', () => {
    expect(computeProratedDays(12, d('2026-08-10T00:00:00.000Z'), 2026)).toBe(5);
  });

  it('October join → 3 months → 3 days', () => {
    expect(computeProratedDays(12, d('2026-10-01T00:00:00.000Z'), 2026)).toBe(3);
  });

  it('rounds to the nearest half day (15 days, Nov → 2.5)', () => {
    expect(computeProratedDays(15, d('2026-11-01T00:00:00.000Z'), 2026)).toBe(2.5);
  });

  it('returns 0 when the leave type grants no days', () => {
    expect(computeProratedDays(0, d('2026-03-01T00:00:00.000Z'), 2026)).toBe(0);
  });

  it('grants the full allocation when the employee joined in a prior year', () => {
    expect(computeProratedDays(12, d('2024-06-01T00:00:00.000Z'), 2026)).toBe(12);
  });

  it('grants nothing for a year before the join year', () => {
    expect(computeProratedDays(12, d('2026-05-01T00:00:00.000Z'), 2025)).toBe(0);
  });

  it('never exceeds defaultDays and never goes negative', () => {
    const v = computeProratedDays(10, d('2026-01-01T00:00:00.000Z'), 2026);
    expect(v).toBeLessThanOrEqual(10);
    expect(v).toBeGreaterThanOrEqual(0);
  });
});
