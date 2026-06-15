import { describe, it, expect } from 'vitest';
import { groupThousands, formatVnd, getInitials } from './utils';

describe('groupThousands', () => {
  it('inserts comma separators every three digits', () => {
    expect(groupThousands('1000')).toBe('1,000');
    expect(groupThousands('10000000')).toBe('10,000,000');
    expect(groupThousands('100')).toBe('100');
  });

  it('strips non-digit characters before grouping', () => {
    expect(groupThousands('10,000,000')).toBe('10,000,000');
    expect(groupThousands('1a2b3c4')).toBe('1,234');
    expect(groupThousands('11.000.000')).toBe('11,000,000');
  });

  it('returns an empty string when there are no digits', () => {
    expect(groupThousands('')).toBe('');
    expect(groupThousands('abc')).toBe('');
  });

  it('drops leading zeros but keeps a lone zero', () => {
    expect(groupThousands('0')).toBe('0');
    expect(groupThousands('007')).toBe('7');
    expect(groupThousands('00')).toBe('0');
  });
});

describe('formatVnd', () => {
  it('renders a placeholder for empty/invalid values', () => {
    expect(formatVnd(null)).toBe('—');
    expect(formatVnd(undefined)).toBe('—');
    expect(formatVnd('')).toBe('—');
    expect(formatVnd('not-a-number')).toBe('—');
  });
});

describe('getInitials', () => {
  it('takes first + last word initials', () => {
    expect(getInitials('Nguyễn Văn A')).toBe('NA');
    expect(getInitials('Alice')).toBe('A');
    expect(getInitials('')).toBe('?');
  });
});
