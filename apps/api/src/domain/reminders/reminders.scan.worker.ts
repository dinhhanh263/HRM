import { runReminderScan } from './reminders.scan.js';
import { enqueueReminderEmails } from './reminders.queue.js';
import { purgeExpiredStaging } from '../employee-import/employee-import.staging.js';

/** Daily scan (triggered by Cloud Scheduler): create notifications idempotently,
 * fan out email tasks, and purge expired import_staging rows. */
export async function reminderScanHandler(_payload: unknown): Promise<void> {
  const { emailJobs } = await runReminderScan();
  await enqueueReminderEmails(emailJobs);
  await purgeExpiredStaging();
}
