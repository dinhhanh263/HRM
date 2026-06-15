import { z } from 'zod';
import type {
  PublicTenantSettings,
  SettingsAuditEntry,
  TenantSettingsDto,
  TenantSettingsSection,
} from '@hrm/shared';
import { tenantSettingsRepository } from '../repositories/tenant-settings.repository.js';
import { settingsRepository } from '../repositories/settings.repository.js';
import { ValidationError } from '../../shared/errors/AppError.js';

// SPEC-036 — single source of truth for tenant-config defaults. GET returns
// merged(default, stored) per section so a tenant that never saved anything
// still gets a complete, typed payload.

const SECTION_DEFAULTS = {
  company: { name: '', address: '', taxCode: '', contactEmail: '', phone: '' },
  notifications: { probationLeadDays: 7, contractLeadDays: 30 },
  regional: { defaultLanguage: 'vi' as const, weekStart: 'mon' as const },
  security: { passwordMinLength: 8, forceSso: false },
};

const PLAN_DEFAULTS = { name: 'Internal', seatLimit: null as number | null };

// Every PATCH payload is a *partial* of its section; merged over the stored
// value, never over another feature's keys in Tenant.settings.
const SECTION_SCHEMAS: Record<TenantSettingsSection, z.ZodTypeAny> = {
  company: z
    .object({
      name: z.string().max(200),
      address: z.string().max(500),
      taxCode: z.string().max(50),
      contactEmail: z.string().email().max(255).or(z.literal('')),
      phone: z.string().max(30),
    })
    .partial()
    .strict(),
  notifications: z
    .object({
      probationLeadDays: z.number().int().min(1).max(30),
      contractLeadDays: z.number().int().min(1).max(90),
    })
    .partial()
    .strict(),
  regional: z
    .object({
      defaultLanguage: z.enum(['vi', 'en']),
      weekStart: z.enum(['mon', 'sun']),
    })
    .partial()
    .strict(),
  security: z
    .object({
      passwordMinLength: z.number().int().min(8).max(32),
      forceSso: z.boolean(),
    })
    .partial()
    .strict(),
};

type SectionKey = keyof typeof SECTION_DEFAULTS;

function mergedSection<K extends SectionKey>(
  stored: Record<string, unknown>,
  section: K,
): (typeof SECTION_DEFAULTS)[K] {
  const raw = stored[section];
  const overrides = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return { ...SECTION_DEFAULTS[section], ...overrides };
}

/** Diff of the changed fields only — what the audit log stores. */
function diffSection(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) {
      changes[key] = { from: before[key], to: after[key] };
    }
  }
  return changes;
}

export const settingsService = {
  async getSettings(tenantId: string): Promise<TenantSettingsDto> {
    const [stored, seatsUsed] = await Promise.all([
      tenantSettingsRepository.getSettings(tenantId),
      settingsRepository.countActiveUsers(tenantId),
    ]);

    const planRaw = stored.plan;
    const plan =
      planRaw && typeof planRaw === 'object' && !Array.isArray(planRaw)
        ? { ...PLAN_DEFAULTS, ...planRaw }
        : PLAN_DEFAULTS;

    return {
      company: mergedSection(stored, 'company'),
      notifications: mergedSection(stored, 'notifications'),
      regional: mergedSection(stored, 'regional'),
      security: mergedSection(stored, 'security'),
      plan: { ...plan, seatsUsed },
    };
  },

  /** Safe subset for every authenticated user (calendar weekStart, default language, forceSso). */
  async getPublicSettings(tenantId: string): Promise<PublicTenantSettings> {
    const stored = await tenantSettingsRepository.getSettings(tenantId);
    return {
      regional: mergedSection(stored, 'regional'),
      security: { forceSso: mergedSection(stored, 'security').forceSso },
    };
  },

  /** Lightweight accessor for the reminder engine / dashboard (no seat count). */
  async getNotificationSettings(tenantId: string) {
    const stored = await tenantSettingsRepository.getSettings(tenantId);
    return mergedSection(stored, 'notifications');
  },

  /** Lightweight accessor for the auth flows (SPEC-036 security policy). */
  async getSecuritySettings(tenantId: string) {
    const stored = await tenantSettingsRepository.getSettings(tenantId);
    return mergedSection(stored, 'security');
  },

  async patchSection(
    tenantId: string,
    actorUserId: string,
    section: string,
    payload: unknown,
  ): Promise<TenantSettingsDto> {
    const schema = SECTION_SCHEMAS[section as TenantSettingsSection];
    if (!schema) {
      throw new ValidationError(`Unknown settings section: ${section}`);
    }
    const result = schema.safeParse(payload);
    if (!result.success) {
      const message = result.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      throw new ValidationError(message);
    }

    const stored = await tenantSettingsRepository.getSettings(tenantId);
    const before = mergedSection(stored, section as SectionKey) as Record<string, unknown>;
    const merged = { ...before, ...(result.data as Record<string, unknown>) };

    // Shallow merge at the top level: only this section's key is written, so
    // other features sharing Tenant.settings are never clobbered.
    await tenantSettingsRepository.mergeSettings(tenantId, { [section]: merged });

    const changes = diffSection(before, merged);
    if (Object.keys(changes).length > 0) {
      await settingsRepository.insertAudit({ tenantId, userId: actorUserId, section, changes });
    }

    return this.getSettings(tenantId);
  },

  async listAudit(tenantId: string): Promise<SettingsAuditEntry[]> {
    const rows = await settingsRepository.listAudit(tenantId);
    return rows.map((r) => ({
      id: r.id,
      section: r.section,
      changes: r.changes as SettingsAuditEntry['changes'],
      changedBy: { id: r.user.id, fullName: r.user.fullName },
      createdAt: r.createdAt.toISOString(),
    }));
  },
};
