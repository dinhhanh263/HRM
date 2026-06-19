import { buildDashboardLink } from '../../shared/configs/email.config.js';
import { emailProvider } from '../../infrastructure/email/email.provider.js';
import type { ReminderEmailJob } from './reminders.service.js';

/** Dispatch one reminder email by kind. Throwing → 500 → Cloud Tasks retry. */
export async function reminderEmailHandler(payload: unknown): Promise<void> {
  const { kind, to, recipientName, employeeName, dueDate, daysUntil } = payload as ReminderEmailJob;
  const input = { to, recipientName, employeeName, dueDate, daysUntil, link: buildDashboardLink() };
  if (kind === 'probation_ending') {
    await emailProvider.sendProbationReminder(input);
  } else {
    await emailProvider.sendContractReminder(input);
  }
}
