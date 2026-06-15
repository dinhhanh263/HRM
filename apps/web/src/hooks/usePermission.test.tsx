import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { UserDto } from '@hrm/shared';
import { useAuthStore } from '@/stores/auth.store';
import { usePermission } from './usePermission';

function makeUser(permissions: string[]): UserDto {
  return {
    id: 'u1',
    email: 'u1@example.com',
    fullName: 'User One',
    role: 'EMPLOYEE',
    roleId: 'role-1',
    permissions,
    status: 'ACTIVE',
    tenantId: 'tenant-1',
    employee: null,
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
  };
}

describe('usePermission', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
  });

  it('can() returns true for a granted permission key', () => {
    useAuthStore.setState({ user: makeUser(['employees:view', 'employees:create']) });
    const { result } = renderHook(() => usePermission());
    expect(result.current.can('employees:view')).toBe(true);
  });

  it('can() returns false for a permission the user lacks', () => {
    useAuthStore.setState({ user: makeUser(['employees:view']) });
    const { result } = renderHook(() => usePermission());
    expect(result.current.can('employees:delete')).toBe(false);
  });

  it('can() returns false when there is no authenticated user', () => {
    const { result } = renderHook(() => usePermission());
    expect(result.current.can('employees:view')).toBe(false);
  });

  it('canAny() returns true when at least one key is granted', () => {
    useAuthStore.setState({ user: makeUser(['employees:export']) });
    const { result } = renderHook(() => usePermission());
    expect(result.current.canAny(['employees:create', 'employees:export'])).toBe(true);
  });

  it('canAny() returns false when none of the keys are granted', () => {
    useAuthStore.setState({ user: makeUser(['dashboard:view']) });
    const { result } = renderHook(() => usePermission());
    expect(result.current.canAny(['employees:create', 'employees:export'])).toBe(false);
  });

  it('canAll() returns true only when every key is granted', () => {
    useAuthStore.setState({ user: makeUser(['employees:view', 'employees:update']) });
    const { result } = renderHook(() => usePermission());
    expect(result.current.canAll(['employees:view', 'employees:update'])).toBe(true);
    expect(result.current.canAll(['employees:view', 'employees:delete'])).toBe(false);
  });
});
