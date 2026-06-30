import { describe, it, expect } from 'vitest';
import { normalizePhone, buildCustomerScopeWhere } from '../../src/domain/sales/customer.normalize.js';

describe('normalizePhone (VN → E.164)', () => {
  it('should convert a 0-prefixed VN mobile to +84', () => {
    expect(normalizePhone('0901234567')).toBe('+84901234567');
  });

  it('should strip spaces, dots and dashes', () => {
    expect(normalizePhone('090 123 4567')).toBe('+84901234567');
    expect(normalizePhone('090.123.4567')).toBe('+84901234567');
    expect(normalizePhone('090-123-4567')).toBe('+84901234567');
  });

  it('should keep an already +84 number canonical', () => {
    expect(normalizePhone('+84 90 123 4567')).toBe('+84901234567');
  });

  it('should convert a bare 84-prefixed number to +84', () => {
    expect(normalizePhone('84901234567')).toBe('+84901234567');
  });

  it('should return null for empty / too-short / non-numeric input', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('   ')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('12')).toBeNull();
  });
});

describe('buildCustomerScopeWhere', () => {
  it('should return an empty fragment when caller can view all', () => {
    expect(buildCustomerScopeWhere({ canViewAll: true, employeeId: 'e1' })).toEqual({});
  });

  it('should scope to own records OR the unassigned Lead Pool when not view_all', () => {
    expect(buildCustomerScopeWhere({ canViewAll: false, employeeId: 'e1' })).toEqual({
      OR: [{ ownerId: 'e1' }, { ownerId: null }],
    });
  });

  it('should restrict a profile-less, non-view_all caller to the Lead Pool only', () => {
    expect(buildCustomerScopeWhere({ canViewAll: false, employeeId: null })).toEqual({
      OR: [{ ownerId: null }],
    });
  });
});
