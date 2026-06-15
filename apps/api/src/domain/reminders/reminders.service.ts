// Pure reminder-selection logic for SPEC-017. No Redis, no DB, no I/O — every
// function here is deterministic given its inputs, so the windowing, dedupe-key
// and copy rules are unit-testable in isolation. The orchestration that reads
// the database and enqueues email lives in `reminders.scan.ts`.

export type ReminderKind = 'probation_ending' | 'contract_expiring';

/** Lead time, in days, before a probation end date we start reminding HR. */
export const PROBATION_LEAD_DAYS = 7;

// SPEC-036: caps of the tenant-configurable leads — MUST match the Zod ranges
// in settings.service.ts. The scan fetches candidates with these maxima, then
// filters per tenant.
export const MAX_PROBATION_LEAD_DAYS = 30;
export const MAX_CONTRACT_LEAD_DAYS = 90;

/** Lead time, in days, before a contract end date we start reminding HR. */
export const CONTRACT_LEAD_DAYS = 30;

/**
 * The product operates in Vietnam (ICT, UTC+7, no DST). Reminder windows are
 * day-granular and must be evaluated against the *local* calendar date, so we
 * shift instants by a fixed offset rather than depending on the server's TZ.
 */
const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;
const MS_PER_DAY = 86_400_000;

/** Whole-day index of an instant on the ICT calendar (days since the epoch). */
export function ictDayNumber(d: Date): number {
  return Math.floor((d.getTime() + ICT_OFFSET_MS) / MS_PER_DAY);
}

/** `YYYY-MM-DD` of an instant on the ICT calendar. */
export function ictISODate(d: Date): string {
  const shifted = new Date(d.getTime() + ICT_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** An employee whose probation may be ending soon. */
export interface ProbationCandidate {
  tenantId: string;
  employeeId: string;
  employeeName: string;
  probationEndDate: Date;
}

/** An ACTIVE, fixed-term contract that may be expiring soon. */
export interface ContractCandidate {
  tenantId: string;
  contractId: string;
  employeeId: string;
  employeeName: string;
  endDate: Date;
}

/** A reminder that is due today for one underlying entity (not yet per-recipient). */
export interface DueReminder {
  tenantId: string;
  kind: ReminderKind;
  entityType: 'employee' | 'contract';
  entityId: string;
  employeeName: string;
  /** Target date (probation end / contract end) as `YYYY-MM-DD` in ICT. */
  dueDate: string;
  /** Whole days from today (ICT) until `dueDate`; always within [0, lead]. */
  daysUntil: number;
  /** Stable idempotency key — see `buildDedupeKey`. */
  dedupeKey: string;
}

/**
 * Idempotency key for a reminder: `{kind}:{entityId}:{dueDate}`. Embedding the
 * due date means that if HR later changes the date a fresh reminder is allowed
 * to fire for the new date, while re-scanning the same day stays a no-op.
 */
export function buildDedupeKey(kind: ReminderKind, entityId: string, dueDate: string): string {
  return `${kind}:${entityId}:${dueDate}`;
}

/** SPEC-036: per-tenant lead overrides, keyed by tenantId. */
export interface TenantLeadConfig {
  probationLeadDays: number;
  contractLeadDays: number;
}

/**
 * Select the reminders that are due as of `now`. A reminder fires when the
 * target date falls within the inclusive ICT window `[today, today + lead]`.
 * Anything in the past (already expired) or beyond the lead is excluded.
 * `leadsByTenant` (SPEC-036) overrides the default leads per tenant; tenants
 * absent from the map keep the engine defaults.
 */
export function selectDueReminders(
  probation: ProbationCandidate[],
  contracts: ContractCandidate[],
  now: Date,
  leadsByTenant?: Map<string, TenantLeadConfig>,
): DueReminder[] {
  const today = ictDayNumber(now);
  const due: DueReminder[] = [];
  const probationLead = (tenantId: string) =>
    leadsByTenant?.get(tenantId)?.probationLeadDays ?? PROBATION_LEAD_DAYS;
  const contractLead = (tenantId: string) =>
    leadsByTenant?.get(tenantId)?.contractLeadDays ?? CONTRACT_LEAD_DAYS;

  for (const c of probation) {
    const daysUntil = ictDayNumber(c.probationEndDate) - today;
    if (daysUntil < 0 || daysUntil > probationLead(c.tenantId)) continue;
    const dueDate = ictISODate(c.probationEndDate);
    due.push({
      tenantId: c.tenantId,
      kind: 'probation_ending',
      entityType: 'employee',
      entityId: c.employeeId,
      employeeName: c.employeeName,
      dueDate,
      daysUntil,
      dedupeKey: buildDedupeKey('probation_ending', c.employeeId, dueDate),
    });
  }

  for (const c of contracts) {
    const daysUntil = ictDayNumber(c.endDate) - today;
    if (daysUntil < 0 || daysUntil > contractLead(c.tenantId)) continue;
    const dueDate = ictISODate(c.endDate);
    due.push({
      tenantId: c.tenantId,
      kind: 'contract_expiring',
      entityType: 'contract',
      entityId: c.contractId,
      employeeName: c.employeeName,
      dueDate,
      daysUntil,
      dedupeKey: buildDedupeKey('contract_expiring', c.contractId, dueDate),
    });
  }

  return due;
}

/** Payload for one reminder email (one recipient × one due reminder). */
export interface ReminderEmailJob {
  to: string;
  recipientName: string;
  kind: ReminderKind;
  employeeName: string;
  /** Target date as `dd/MM/yyyy` for display. */
  dueDate: string;
  daysUntil: number;
}

/** Human-readable Vietnamese "in N days" suffix (HR-facing copy). */
function inDaysSuffix(daysUntil: number): string {
  return daysUntil === 0 ? '(hôm nay)' : `(còn ${daysUntil} ngày)`;
}

/** `YYYY-MM-DD` → `dd/MM/yyyy` for display in notification bodies. */
export function toDisplayDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

/** Notification title + body for a due reminder (Vietnamese, vi-first product). */
export function formatReminderContent(r: DueReminder): { title: string; body: string } {
  const when = toDisplayDate(r.dueDate);
  const suffix = inDaysSuffix(r.daysUntil);
  if (r.kind === 'probation_ending') {
    return {
      title: `${r.employeeName} sắp hết thử việc`,
      body: `Thử việc kết thúc vào ${when} ${suffix}.`,
    };
  }
  return {
    title: `Hợp đồng của ${r.employeeName} sắp hết hạn`,
    body: `Hợp đồng hết hạn vào ${when} ${suffix}.`,
  };
}
