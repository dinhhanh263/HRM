import { permissionRepository } from '../repositories/permission.repository.js';
import { TtlCache } from '../../infrastructure/cache/permission-cache.js';

const CACHE_TTL_MS = 60_000; // 60s; bounds cross-instance staleness
const cache = new TtlCache<string[]>(CACHE_TTL_MS);

export const permissionService = {
  /** Resolve a role's permission keys; in-process TTL cache over the DB. */
  async getPermissionsForRole(roleId: string): Promise<Set<string>> {
    const cached = cache.get(roleId);
    if (cached) return new Set(cached);
    const keys = await permissionRepository.findKeysByRoleId(roleId);
    cache.set(roleId, keys);
    return new Set(keys);
  },

  invalidateRolePermissions(roleId: string): void {
    cache.delete(roleId);
  },
};
