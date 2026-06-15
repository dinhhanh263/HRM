import { Worker, type Job } from 'bullmq';
import { createQueueConnection } from '../../infrastructure/queue/connection.js';
import { REMINDER_SCAN_QUEUE_NAME } from '../../shared/configs/email.config.js';
import { runReminderScan } from './reminders.scan.js';
import { enqueueReminderEmails } from './reminders.queue.js';

/**
 * Process one daily-scan job: run the (queue-free) scan to create in-app
 * notifications idempotently, then fan out the email jobs for the genuinely-new
 * notifications onto the reminder-email queue. Errors propagate so BullMQ's
 * retry/backoff applies; the scan itself is idempotent so a retry is safe.
 */
async function handleScanJob(_job: Job): Promise<void> {
  const { emailJobs } = await runReminderScan();
  await enqueueReminderEmails(emailJobs);
}

/**
 * Start the reminder-scan worker. Called once at server startup. The caller
 * owns the returned Worker and must `close()` it on shutdown. Concurrency 1:
 * the daily scan is a single coordinated pass, not parallelizable work.
 */
export function createReminderScanWorker(): Worker {
  return new Worker(REMINDER_SCAN_QUEUE_NAME, handleScanJob, {
    connection: createQueueConnection(),
    concurrency: 1,
  });
}
