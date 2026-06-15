import { db } from '../../infrastructure/database/client.js';
import type { ProbationCandidate, ContractCandidate } from './reminders.service.js';

// Coarse DB-side date bounds. The exact ICT windowing is done by the pure
// `selectDueReminders`; here we just narrow the scan to a few days around the
// lead so we never load the whole table. Widened by a couple of days each side
// so an ICT/UTC midnight skew can never drop a genuinely-due row.
const DAY_MS = 86_400_000;
const COARSE_PAD_DAYS = 2;

function coarseRange(now: Date, leadDays: number): { gte: Date; lte: Date } {
  return {
    gte: new Date(now.getTime() - COARSE_PAD_DAYS * DAY_MS),
    lte: new Date(now.getTime() + (leadDays + COARSE_PAD_DAYS) * DAY_MS),
  };
}

/** One HR recipient of lifecycle reminders within a tenant. */
export interface ReminderRecipient {
  userId: string;
  email: string;
  fullName: string;
  /** SPEC-037: per-kind email opt-out; missing key = enabled. */
  notificationPrefs: Record<string, boolean>;
}

/** A notification row to be inserted (one per recipient × due reminder). */
export interface NotificationInsert {
  tenantId: string;
  userId: string;
  kind: string;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  dedupeKey: string;
}

export const remindersRepository = {
  /**
   * ACTIVE employees across all tenants whose probation end date is near. The
   * caller's pure selector applies the exact ICT window.
   */
  async findProbationCandidates(
    now: Date,
    leadDays: number,
    tenantId?: string,
  ): Promise<ProbationCandidate[]> {
    const range = coarseRange(now, leadDays);
    const rows = await db.employee.findMany({
      where: { status: 'ACTIVE', probationEndDate: range, ...(tenantId ? { tenantId } : {}) },
      select: { id: true, tenantId: true, fullName: true, probationEndDate: true },
    });
    return rows.map((r) => ({
      tenantId: r.tenantId,
      employeeId: r.id,
      employeeName: r.fullName,
      // Non-null by the `probationEndDate: range` filter above.
      probationEndDate: r.probationEndDate as Date,
    }));
  },

  /**
   * ACTIVE fixed-term contracts (endDate set) across all tenants whose end date
   * is near, for employees who are still ACTIVE. Indefinite contracts (endDate
   * null) are excluded by the range filter.
   */
  async findContractCandidates(
    now: Date,
    leadDays: number,
    tenantId?: string,
  ): Promise<ContractCandidate[]> {
    const range = coarseRange(now, leadDays);
    const rows = await db.contract.findMany({
      where: {
        status: 'ACTIVE',
        endDate: range,
        employee: { status: 'ACTIVE' },
        ...(tenantId ? { tenantId } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        endDate: true,
        employeeId: true,
        employee: { select: { fullName: true } },
      },
    });
    return rows.map((r) => ({
      tenantId: r.tenantId,
      contractId: r.id,
      employeeId: r.employeeId,
      employeeName: r.employee.fullName,
      endDate: r.endDate as Date,
    }));
  },

  /**
   * ACTIVE users in a tenant whose role grants `employees:update` — the HR-level
   * recipients of lifecycle reminders. Mirrors the permission gate used to scope
   * the dashboard to company-wide oversight.
   */
  async findHrRecipients(tenantId: string): Promise<ReminderRecipient[]> {
    const users = await db.user.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        roleRef: { permissions: { some: { permission: { key: 'employees:update' } } } },
      },
      select: { id: true, email: true, fullName: true, notificationPrefs: true },
    });
    return users.map((u) => ({
      userId: u.id,
      email: u.email,
      fullName: u.fullName,
      // SPEC-037: per-kind email opt-out; missing key = enabled.
      notificationPrefs: (u.notificationPrefs as Record<string, boolean> | null) ?? {},
    }));
  },

  /**
   * Existing `{userId}:{dedupeKey}` pairs among the given candidates, so the scan
   * can fan out email for genuinely-new notifications only. Idempotency is also
   * enforced at the DB by the `@@unique([userId, dedupeKey])` constraint.
   */
  async findExistingKeys(
    tenantId: string,
    userIds: string[],
    dedupeKeys: string[],
  ): Promise<Set<string>> {
    if (userIds.length === 0 || dedupeKeys.length === 0) return new Set();
    const rows = await db.notification.findMany({
      where: { tenantId, userId: { in: userIds }, dedupeKey: { in: dedupeKeys } },
      select: { userId: true, dedupeKey: true },
    });
    return new Set(rows.map((r) => `${r.userId}:${r.dedupeKey}`));
  },

  /** Bulk-insert notifications; `skipDuplicates` guards against scan races. */
  async createNotifications(rows: NotificationInsert[]): Promise<number> {
    if (rows.length === 0) return 0;
    const { count } = await db.notification.createMany({ data: rows, skipDuplicates: true });
    return count;
  },
};
