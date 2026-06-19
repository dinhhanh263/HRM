import { enqueueTask } from '../../infrastructure/tasks/dispatcher.js';
import type { ReminderEmailJob } from './reminders.service.js';

/** Enqueue one reminder-email task per HR recipient for genuinely-new notifications. */
export async function enqueueReminderEmails(jobs: ReminderEmailJob[]): Promise<void> {
  await Promise.all(jobs.map((data) => enqueueTask('reminder-email', data)));
}
