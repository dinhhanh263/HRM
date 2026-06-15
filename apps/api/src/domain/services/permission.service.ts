import { redis } from '../../infrastructure/cache/redis.js';
import { permissionRepository } from '../repositories/permission.repository.js';

const CACHE_TTL_SECONDS = 60 * 60; // 1h

function cacheKey(roleId: string): string {
  return `hrm:v1:role:${roleId}:perms`;
}

export const permissionService = {
  /**
   * Resolve a role's permission keys as a Set. Cache-aside on Redis; on any
   * cache error we fall back to the database so authz never hard-fails on Redis.
   */
  async getPermissionsForRole(roleId: string): Promise<Set<string>> {
    try {
      const cached = await redis.get(cacheKey(roleId));
      if (cached) {
        return new Set(JSON.parse(cached) as string[]);
      }
    } catch {
      // Redis unavailable — fall through to DB.
    }

    const keys = await permissionRepository.findKeysByRoleId(roleId);

    try {
      await redis.setex(cacheKey(roleId), CACHE_TTL_SECONDS, JSON.stringify(keys));
    } catch {
      // Best-effort cache write.
    }

    return new Set(keys);
  },

  async invalidateRolePermissions(roleId: string): Promise<void> {
    try {
      await redis.del(cacheKey(roleId));
    } catch {
      // Best-effort invalidation.
    }
  },
};
