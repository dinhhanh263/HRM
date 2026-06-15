import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../../src/shared/errors/AppError.js';

const getPermissionsForRole = vi.fn();

vi.mock('../../src/domain/services/permission.service.js', () => ({
  permissionService: { getPermissionsForRole },
}));

const { requirePermission } = await import(
  '../../src/app/middlewares/authorize.middleware.js'
);

function runGuard(user: unknown, keys: string[]) {
  const req = { user } as unknown as Request;
  const res = {} as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { promise: requirePermission(...keys)(req, res, next), next };
}

describe('requirePermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject when there is no authenticated user', async () => {
    const { promise } = runGuard(undefined, ['employees:view']);
    await expect(promise).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should bypass permission checks for SUPER_ADMIN (un-lockout guarantee)', async () => {
    const { promise, next } = runGuard(
      { role: 'SUPER_ADMIN', roleId: null },
      ['employees:delete'],
    );

    await promise;

    expect(next).toHaveBeenCalledOnce();
    expect(getPermissionsForRole).not.toHaveBeenCalled();
  });

  it('should reject a non-admin user that has no roleId', async () => {
    const { promise } = runGuard(
      { role: 'EMPLOYEE', roleId: null },
      ['employees:view'],
    );

    await expect(promise).rejects.toBeInstanceOf(ForbiddenError);
    expect(getPermissionsForRole).not.toHaveBeenCalled();
  });

  it('should call next when the role grants every required key', async () => {
    getPermissionsForRole.mockResolvedValue(
      new Set(['employees:view', 'employees:create']),
    );

    const { promise, next } = runGuard(
      { role: 'HR_MANAGER', roleId: 'role-1' },
      ['employees:view', 'employees:create'],
    );

    await promise;

    expect(getPermissionsForRole).toHaveBeenCalledWith('role-1');
    expect(next).toHaveBeenCalledOnce();
  });

  it('should reject when the role is missing any required key', async () => {
    getPermissionsForRole.mockResolvedValue(new Set(['employees:view']));

    const { promise } = runGuard(
      { role: 'EMPLOYEE', roleId: 'role-2' },
      ['employees:view', 'employees:create'],
    );

    await expect(promise).rejects.toBeInstanceOf(ForbiddenError);
  });
});
