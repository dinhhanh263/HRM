import { describe, it, expect } from 'vitest';
import { registerSchema } from './validations';

const valid = {
  email: 'user@company.com',
  password: 'Abcd1234',
  confirmPassword: 'Abcd1234',
  fullName: 'Nguyen Van A',
  tenantSlug: 'acme',
};

function firstError(data: Record<string, unknown>) {
  const res = registerSchema.safeParse(data);
  return res.success ? null : res.error.issues[0].message;
}

describe('registerSchema', () => {
  it('accepts a fully valid payload', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an invalid email', () => {
    expect(firstError({ ...valid, email: 'nope' })).toBe('validation.emailInvalid');
  });

  it('rejects a password shorter than 8 chars', () => {
    expect(firstError({ ...valid, password: 'Ab1', confirmPassword: 'Ab1' })).toBe(
      'validation.passwordMin'
    );
  });

  it('requires an uppercase letter', () => {
    expect(firstError({ ...valid, password: 'abcd1234', confirmPassword: 'abcd1234' })).toBe(
      'validation.passwordUpper'
    );
  });

  it('requires a lowercase letter', () => {
    expect(firstError({ ...valid, password: 'ABCD1234', confirmPassword: 'ABCD1234' })).toBe(
      'validation.passwordLower'
    );
  });

  it('requires a digit', () => {
    expect(firstError({ ...valid, password: 'Abcdefgh', confirmPassword: 'Abcdefgh' })).toBe(
      'validation.passwordDigit'
    );
  });

  it('rejects a too-short full name', () => {
    expect(firstError({ ...valid, fullName: 'A' })).toBe('validation.fullNameMin');
  });

  it('requires a tenant slug', () => {
    expect(firstError({ ...valid, tenantSlug: '' })).toBe('validation.tenantRequired');
  });

  it('flags mismatched password confirmation on confirmPassword', () => {
    const res = registerSchema.safeParse({ ...valid, confirmPassword: 'Different1' });
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues.find((i) => i.path[0] === 'confirmPassword');
      expect(issue?.message).toBe('validation.passwordMismatch');
    }
  });
});
