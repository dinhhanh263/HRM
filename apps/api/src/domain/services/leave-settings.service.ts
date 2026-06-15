import { tenantSettingsRepository } from '../repositories/tenant-settings.repository.js';
import type { LeaveSettingsDto } from '@hrm/shared';

// The leave config lives under this top-level key inside Tenant.settings JSON.
const LEAVE_PRORATA_KEY = 'leaveProrata';

// Reads the persisted pro-rata flag, defaulting to false when unset or malformed.
function readProRataEnabled(settings: Record<string, unknown>): boolean {
  const node = settings[LEAVE_PRORATA_KEY];
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    return (node as Record<string, unknown>).enabled === true;
  }
  return false;
}

export const leaveSettingsService = {
  /** Returns the tenant's leave settings; pro-rata defaults to false when unset. */
  async getProRata(tenantId: string): Promise<LeaveSettingsDto> {
    const settings = await tenantSettingsRepository.getSettings(tenantId);
    return { proRataEnabled: readProRataEnabled(settings) };
  },

  /** Persists the pro-rata flag without clobbering other tenant settings keys. */
  async setProRata(tenantId: string, enabled: boolean): Promise<LeaveSettingsDto> {
    const merged = await tenantSettingsRepository.mergeSettings(tenantId, {
      [LEAVE_PRORATA_KEY]: { enabled },
    });
    return { proRataEnabled: readProRataEnabled(merged) };
  },
};
