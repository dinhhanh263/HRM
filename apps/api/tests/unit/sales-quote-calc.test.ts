import { describe, it, expect } from 'vitest';
import { computeLineTotal, computeQuoteTotal } from '../../src/domain/sales/quote-calc.js';

describe('computeLineTotal', () => {
  it('multiplies quantity × unitPrice with no discount', () => {
    expect(computeLineTotal('2', '150000', '0').toString()).toBe('300000');
  });

  it('applies a percentage discount', () => {
    expect(computeLineTotal('1', '1000000', '10').toString()).toBe('900000');
  });

  it('rounds to 2 decimal places (3 × 33.333 = 99.999 → 100)', () => {
    expect(computeLineTotal('3', '33.333', '0').toString()).toBe('100');
  });

  it('handles fractional quantity + discount', () => {
    // 2.5 × 200 × (1 - 0.2) = 400
    expect(computeLineTotal('2.5', '200', '20').toString()).toBe('400');
  });
});

describe('computeQuoteTotal', () => {
  it('sums line totals', () => {
    const total = computeQuoteTotal([
      { quantity: '2', unitPrice: '150000', discountPct: '0' },
      { quantity: '1', unitPrice: '1000000', discountPct: '10' },
    ]);
    expect(total.toString()).toBe('1200000'); // 300000 + 900000
  });

  it('returns 0 for an empty quote', () => {
    expect(computeQuoteTotal([]).toString()).toBe('0');
  });
});
