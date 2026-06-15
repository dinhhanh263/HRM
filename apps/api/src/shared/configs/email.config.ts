// Configuration for outbound email + the invite queue that fans out invite
// emails after a bulk import. Values read from env so local dev without a
// Resend key degrades gracefully (see email.provider.ts).

/** BullMQ queue name for invite emails. See naming-conventions.md. */
export const INVITE_QUEUE_NAME = 'hrm.employee.invite';

/** The named job within the invite queue. */
export const INVITE_JOB_NAME = 'send-invite';

/** How long a finished invite job is retained before BullMQ removes it. */
export const INVITE_JOB_RETENTION_SECONDS = 24 * 60 * 60;

/** BullMQ queue that runs the daily lifecycle-reminder scan (probation/contract). */
export const REMINDER_SCAN_QUEUE_NAME = 'hrm.reminders.scan';

/** The repeatable job within the scan queue. */
export const REMINDER_SCAN_JOB_NAME = 'daily-scan';

/** BullMQ queue that fans out one reminder email per HR recipient. */
export const REMINDER_EMAIL_QUEUE_NAME = 'hrm.reminders.email';

/** The named job within the reminder-email queue. */
export const REMINDER_EMAIL_JOB_NAME = 'send-reminder';

/** Retention for finished reminder jobs before BullMQ removes them. */
export const REMINDER_JOB_RETENTION_SECONDS = 24 * 60 * 60;

/**
 * Cron for the daily scan. Evaluated in ICT (see tz below) so it fires at
 * ~07:00 local Vietnam time regardless of the server's timezone.
 */
export const REMINDER_SCAN_CRON = '0 7 * * *';

/** Timezone the scan cron is evaluated in. Vietnam, UTC+7, no DST. */
export const REMINDER_SCAN_TZ = 'Asia/Ho_Chi_Minh';

/** Resend API key. When unset, the provider logs a warning and no-ops. */
export const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';

/** From address for transactional email. Resend's sandbox sender by default. */
export const EMAIL_FROM = process.env.EMAIL_FROM ?? 'HRM <onboarding@resend.dev>';

/** Public web app base URL used to build the set-password invite link. */
export const APP_WEB_URL = process.env.APP_WEB_URL ?? 'http://localhost:5173';

/** Build the set-password link a recipient follows to complete their invite. */
export function buildSetPasswordLink(rawToken: string): string {
  return `${APP_WEB_URL}/set-password?token=${encodeURIComponent(rawToken)}`;
}

/** Build the reset-password link sent in the forgot-password email. */
export function buildResetPasswordLink(rawToken: string): string {
  return `${APP_WEB_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

/** Build the link an approver follows to review pending payroll runs. */
export function buildPayrollRunsLink(): string {
  return `${APP_WEB_URL}/payroll`;
}

/** Build the link an HR recipient follows from a lifecycle-reminder email. */
export function buildDashboardLink(): string {
  return `${APP_WEB_URL}/`;
}
