// SPEC-036 — tenant-level configuration served by GET /api/v1/settings.
// Personal display preferences (theme/dark/language of one user) do NOT live
// here; they stay client-side in the preferences menu.

export interface TenantCompanySettings {
  name: string;
  address: string;
  taxCode: string;
  contactEmail: string;
  phone: string;
}

export interface TenantNotificationSettings {
  /** Days before probation end that reminders/dashboard events fire (1–30). */
  probationLeadDays: number;
  /** Days before contract end that reminders/dashboard events fire (1–90). */
  contractLeadDays: number;
}

export type TenantWeekStart = 'mon' | 'sun';

export interface TenantRegionalSettings {
  /** Default UI language for users who never picked one themselves. */
  defaultLanguage: 'vi' | 'en';
  /** First column of calendar grids. */
  weekStart: TenantWeekStart;
}

export interface TenantSecuritySettings {
  /** Server-enforced minimum password length (8–32). */
  passwordMinLength: number;
  /** When true, password login is rejected for everyone except SUPER_ADMIN. */
  forceSso: boolean;
}

export interface TenantPlanInfo {
  name: string;
  /** null = unlimited. */
  seatLimit: number | null;
  /** Computed: ACTIVE users of the tenant. */
  seatsUsed: number;
}

export interface TenantSettingsDto {
  company: TenantCompanySettings;
  notifications: TenantNotificationSettings;
  regional: TenantRegionalSettings;
  security: TenantSecuritySettings;
  plan: TenantPlanInfo;
}

/** Sections writable via PATCH /api/v1/settings/:section. */
export type TenantSettingsSection = 'company' | 'notifications' | 'regional' | 'security';

/** Payload of GET /api/v1/settings/public — safe for every authenticated user. */
export interface PublicTenantSettings {
  regional: TenantRegionalSettings;
  // SPEC-037: the account screen (and later the login screen) adapts when
  // password login is disabled. Server-enforced regardless.
  security: { forceSso: boolean };
}

export interface SettingsAuditEntry {
  id: string;
  section: string;
  /** { field: { from, to } } for each changed field. */
  changes: Record<string, { from: unknown; to: unknown }>;
  changedBy: { id: string; fullName: string };
  createdAt: string;
}
