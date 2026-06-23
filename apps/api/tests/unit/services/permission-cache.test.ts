import { describe, it, expect, vi, beforeEach } from 'vitest';
import { permissionService } from '../../../src/domain/services/permission.service.js';
import { permissionRepository } from '../../../src/domain/repositories/permission.repository.js';

describe('permissionService in-process cache', () => {
  beforeEach(() => permissionService.invalidateRolePermissions('role-1'));

  it('caches the DB result and serves the second call from memory', async () => {
    const spy = vi.spyOn(permissionRepository, 'findKeysByRoleId').mockResolvedValue(['a', 'b']);
    const first = await permissionService.getPermissionsForRole('role-1');
    const second = await permissionService.getPermissionsForRole('role-1');
    expect([...first].sort()).toEqual(['a', 'b']);
    expect(second.has('a')).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1); // second served from cache
    spy.mockRestore();
  });

  it('re-reads the DB after invalidation', async () => {
    const spy = vi.spyOn(permissionRepository, 'findKeysByRoleId').mockResolvedValue(['x']);
    await permissionService.getPermissionsForRole('role-1');
    permissionService.invalidateRolePermissions('role-1');
    await permissionService.getPermissionsForRole('role-1');
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
