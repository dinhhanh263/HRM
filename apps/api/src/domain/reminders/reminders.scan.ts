import { logger } from '../../shared/utils/logger.js';
import {
  selectDueReminders,
  formatReminderContent,
  toDisplayDate,
  MAX_PROBATION_LEAD_DAYS,
  MAX_CONTRACT_LEAD_DAYS,
  type DueReminder,
  type ReminderEmailJob,
  type TenantLeadConfig,
} from './reminders.service.js';
import { settingsService } from '../services/settings.service.js';
import {
  remindersRepository,
  type NotificationInsert,
  type ReminderRecipient,
} from './reminders.repository.js';

export interface ReminderScanResult {
  /** Number of notification rows actually inserted (new, deduped). */
  created: number;
  /** Email jobs for the newly-created notifications only. */
  emailJobs: ReminderEmailJob[];
}

/** Group due reminders by tenant so recipients are resolved once per tenant. */
function groupByTenant(due: DueReminder[]): Map<string, DueReminder[]> {
  const byTenant = new Map<string, DueReminder[]>();
  for (const r of due) {
    const list = byTenant.get(r.tenantId);
    if (list) list.push(r);
    else byTenant.set(r.tenantId, [r]);
  }
  return byTenant;
}

/**
 * Scan every tenant for probation/contract reminders due as of `now`, create
 * one in-app notification per HR recipient (idempotent via dedupeKey), and
 * return the email jobs for the genuinely-new notifications.
 *
 * Pure of Redis: the caller (scan worker) enqueues the returned email jobs.
 * This makes the whole scan integration-testable without a queue.
 *
 * `options.tenantId` narrows the scan to a single tenant — used by the ops
 * manual-trigger and to isolate integration tests from cross-tenant data.
 */
export async function runReminderScan(
  now: Date = new Date(),
  options?: { tenantId?: string },
): Promise<ReminderScanResult> {
  const tenantId = options?.tenantId;
  // SPEC-036: candidates are fetched with the MAX configurable lead, then the
  // per-tenant configured lead filters them in selectDueReminders.
  const [probation, contracts] = await Promise.all([
    remindersRepository.findProbationCandidates(now, MAX_PROBATION_LEAD_DAYS, tenantId),
    remindersRepository.findContractCandidates(now, MAX_CONTRACT_LEAD_DAYS, tenantId),
  ]);

  const involvedTenantIds = [
    ...new Set([...probation, ...contracts].map((c) => c.tenantId)),
  ];
  const leadsByTenant = new Map<string, TenantLeadConfig>(
    await Promise.all(
      involvedTenantIds.map(
        async (id) => [id, await settingsService.getNotificationSettings(id)] as const,
      ),
    ),
  );

  const due = selectDueReminders(probation, contracts, now, leadsByTenant);
  if (due.length === 0) {
    return { created: 0, emailJobs: [] };
  }

  const rowsToInsert: NotificationInsert[] = [];
  const emailJobs: ReminderEmailJob[] = [];

  for (const [scanTenantId, reminders] of groupByTenant(due)) {
    const recipients: ReminderRecipient[] = await remindersRepository.findHrRecipients(scanTenantId);
    if (recipients.length === 0) continue;

    const userIds = recipients.map((r) => r.userId);
    const dedupeKeys = reminders.map((r) => r.dedupeKey);
    const existing = await remindersRepository.findExistingKeys(scanTenantId, userIds, dedupeKeys);

    for (const reminder of reminders) {
      const { title, body } = formatReminderContent(reminder);
      for (const recipient of recipients) {
        if (existing.has(`${recipient.userId}:${reminder.dedupeKey}`)) continue;
        rowsToInsert.push({
          tenantId: scanTenantId,
          userId: recipient.userId,
          kind: reminder.kind,
          title,
          body,
          entityType: reminder.entityType,
          entityId: reminder.entityId,
          dedupeKey: reminder.dedupeKey,
        });
        // SPEC-037: opting out silences the EMAIL only — the in-app
        // notification above is still inserted.
        if (recipient.notificationPrefs[reminder.kind] !== false) {
          emailJobs.push({
            to: recipient.email,
            recipientName: recipient.fullName,
            kind: reminder.kind,
            employeeName: reminder.employeeName,
            dueDate: toDisplayDate(reminder.dueDate),
            daysUntil: reminder.daysUntil,
          });
        }
      }
    }
  }

  const created = await remindersRepository.createNotifications(rowsToInsert);

  logger.info(
    { event: 'reminders.scan.completed', due: due.length, created, emails: emailJobs.length },
    'Lifecycle reminder scan completed',
  );

  return { created, emailJobs };
}
