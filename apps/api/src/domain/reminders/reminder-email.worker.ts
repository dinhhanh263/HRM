import { Worker, type Job } from 'bullmq';
import { createQueueConnection } from '../../infrastructure/queue/connection.js';
import { REMINDER_EMAIL_QUEUE_NAME, buildDashboardLink } from '../../shared/configs/email.config.js';
import { emailProvider } from '../../infrastructure/email/email.provider.js';
import type { ReminderEmailJob } from './reminders.service.js';

/**
 * Process one reminder-email job: dispatch to the probation/contract email by
 * kind. Errors propagate so BullMQ's retry/backoff applies. Concurrency is
 * higher than the scan worker because sending email is I/O-bound and
 * order-independent.
 */
async function handleReminderEmailJob(job: Job<ReminderEmailJob>): Promise<void> {
  const { kind, to, recipientName, employeeName, dueDate, daysUntil } = job.data;
  const input = { to, recipientName, employeeName, dueDate, daysUntil, link: buildDashboardLink() };

  if (kind === 'probation_ending') {
    await emailProvider.sendProbationReminder(input);
  } else {
    await emailProvider.sendContractReminder(input);
  }
}

/**
 * Start the reminder-email worker. Called once at server startup. The caller
 * owns the returned Worker and must `close()` it on shutdown.
 */
export function createReminderEmailWorker(): Worker<ReminderEmailJob, void> {
  return new Worker<ReminderEmailJob, void>(REMINDER_EMAIL_QUEUE_NAME, handleReminderEmailJob, {
    connection: createQueueConnection(),
    concurrency: 5,
  });
}
