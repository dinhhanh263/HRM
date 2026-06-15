import { describe, it, expect } from 'vitest';
import { formatLeaveDate, formatDays } from './utils';

describe('formatLeaveDate', () => {
  it('formats an ISO date as dd/MM/yyyy in UTC', () => {
    expect(formatLeaveDate('2026-06-01T00:00:00.000Z')).toBe('01/06/2026');
  });

  it('pads single-digit days and months', () => {
    expect(formatLeaveDate('2026-01-05T00:00:00.000Z')).toBe('05/01/2026');
  });
});

describe('formatDays', () => {
  it('renders whole numbers without decimals', () => {
    expect(formatDays(3)).toBe('3');
    expect(formatDays(0)).toBe('0');
  });

  it('renders fractional days with one decimal', () => {
    expect(formatDays(0.5)).toBe('0.5');
    expect(formatDays(2.5)).toBe('2.5');
  });
});
