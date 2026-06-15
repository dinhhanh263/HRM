import type { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

// The Tenant.settings JSON column is shared across features (payroll, leave, …).
// This repository reads it and merges patches shallowly so writing one feature's
// keys never clobbers another's.
export const tenantSettingsRepository = {
  /** Returns the raw settings object for a tenant, or `{}` when unset. */
  async getSettings(tenantId: string): Promise<Record<string, unknown>> {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = tenant?.settings;
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
      return settings as Record<string, unknown>;
    }
    return {};
  },

  /**
   * Shallow-merges `patch` into the tenant's existing settings and persists the
   * result. Top-level keys not present in `patch` are preserved. Returns the
   * merged settings object.
   */
  async mergeSettings(
    tenantId: string,
    patch: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const current = await this.getSettings(tenantId);
    const merged = { ...current, ...patch };
    await db.tenant.update({
      where: { id: tenantId },
      data: { settings: merged as Prisma.InputJsonValue },
    });
    return merged;
  },
};
