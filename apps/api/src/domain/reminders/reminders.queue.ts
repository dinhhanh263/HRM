import { Queue } from 'bullmq';
import { createQueueConnection } from '../../infrastructure/queue/connection.js';
import {
  REMINDER_SCAN_QUEUE_NAME,
  REMINDER_SCAN_JOB_NAME,
  REMINDER_SCAN_CRON,
  REMINDER_SCAN_TZ,
  REMINDER_EMAIL_QUEUE_NAME,
  REMINDER_EMAIL_JOB_NAME,
  REMINDER_JOB_RETENTION_SECONDS,
} from '../../shared/configs/email.config.js';
import type { ReminderEmailJob } from './reminders.service.js';

let scanQueue: Queue | null = null;
let emailQueue: Queue<ReminderEmailJob> | null = null;

/** Lazily-constructed singleton scan queue (opens Redis only on first use). */
export function getReminderScanQueue(): Queue {
  if (!scanQueue) {
    scanQueue = new Queue(REMINDER_SCAN_QUEUE_NAME, {
      connection: createQueueConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: REMINDER_JOB_RETENTION_SECONDS },
        removeOnFail: { age: REMINDER_JOB_RETENTION_SECONDS },
      },
    });
  }
  return scanQueue;
}

/** Lazily-constructed singleton reminder-email queue. */
export function getReminderEmailQueue(): Queue<ReminderEmailJob> {
  if (!emailQueue) {
    emailQueue = new Queue<ReminderEmailJob>(REMINDER_EMAIL_QUEUE_NAME, {
      connection: createQueueConnection(),
      defaultJobOptions: {
        // Transient email failures are worth a couple of backed-off retries.
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: REMINDER_JOB_RETENTION_SECONDS },
        removeOnFail: { age: REMINDER_JOB_RETENTION_SECONDS },
      },
    });
  }
  return emailQueue;
}

/**
 * Register (idempotently) the repeatable daily scan. BullMQ keys a repeatable
 * job by name + pattern + tz, so calling this on every boot won't pile up
 * duplicate schedulers. Safe to call at server startup.
 */
export async function scheduleDailyReminderScan(): Promise<void> {
  await getReminderScanQueue().add(
    REMINDER_SCAN_JOB_NAME,
    {},
    { repeat: { pattern: REMINDER_SCAN_CRON, tz: REMINDER_SCAN_TZ } },
  );
}

/** Enqueue one reminder email per HR recipient for the genuinely-new notifications. */
export async function enqueueReminderEmails(jobs: ReminderEmailJob[]): Promise<void> {
  if (jobs.length === 0) return;
  await getReminderEmailQueue().addBulk(jobs.map((data) => ({ name: REMINDER_EMAIL_JOB_NAME, data })));
}
