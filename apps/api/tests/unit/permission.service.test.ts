import { describe, it, expect, vi, beforeEach } from 'vitest';

const redisMock = {
  get: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
};
const repoMock = {
  findKeysByRoleId: vi.fn(),
  findAllKeys: vi.fn(),
};

vi.mock('../../src/infrastructure/cache/redis.js', () => ({ redis: redisMock }));
vi.mock('../../src/domain/repositories/permission.repository.js', () => ({
  permissionRepository: repoMock,
}));

const { permissionService } = await import('../../src/domain/services/permission.service.js');

describe('permissionService.getPermissionsForRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return cached permissions without hitting the database', async () => {
    redisMock.get.mockResolvedValue(JSON.stringify(['employees:view', 'employees:create']));

    const result = await permissionService.getPermissionsForRole('role-1');

    expect(result).toEqual(new Set(['employees:view', 'employees:create']));
    expect(repoMock.findKeysByRoleId).not.toHaveBeenCalled();
    expect(redisMock.setex).not.toHaveBeenCalled();
  });

  it('should query the database and populate the cache on a cache miss', async () => {
    redisMock.get.mockResolvedValue(null);
    repoMock.findKeysByRoleId.mockResolvedValue(['dashboard:view']);

    const result = await permissionService.getPermissionsForRole('role-2');

    expect(result).toEqual(new Set(['dashboard:view']));
    expect(repoMock.findKeysByRoleId).toHaveBeenCalledWith('role-2');
    expect(redisMock.setex).toHaveBeenCalledWith(
      'hrm:v1:role:role-2:perms',
      3600,
      JSON.stringify(['dashboard:view']),
    );
  });

  it('should fall back to the database when Redis read throws', async () => {
    redisMock.get.mockRejectedValue(new Error('redis down'));
    repoMock.findKeysByRoleId.mockResolvedValue(['leave:view']);

    const result = await permissionService.getPermissionsForRole('role-3');

    expect(result).toEqual(new Set(['leave:view']));
    expect(repoMock.findKeysByRoleId).toHaveBeenCalledWith('role-3');
  });

  it('should still resolve permissions when the cache write throws', async () => {
    redisMock.get.mockResolvedValue(null);
    repoMock.findKeysByRoleId.mockResolvedValue(['timesheet:view']);
    redisMock.setex.mockRejectedValue(new Error('redis down'));

    const result = await permissionService.getPermissionsForRole('role-4');

    expect(result).toEqual(new Set(['timesheet:view']));
  });
});

describe('permissionService.invalidateRolePermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delete the cache key for the role', async () => {
    await permissionService.invalidateRolePermissions('role-1');

    expect(redisMock.del).toHaveBeenCalledWith('hrm:v1:role:role-1:perms');
  });

  it('should not throw when Redis delete fails', async () => {
    redisMock.del.mockRejectedValue(new Error('redis down'));

    await expect(
      permissionService.invalidateRolePermissions('role-1'),
    ).resolves.toBeUndefined();
  });
});
