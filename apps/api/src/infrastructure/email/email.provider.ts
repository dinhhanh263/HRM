import { Resend } from 'resend';
import { logger } from '../../shared/utils/logger.js';
import { EMAIL_FROM, RESEND_API_KEY } from '../../shared/configs/email.config.js';

/** Payload for the bulk-import invite email. */
export interface InviteEmailInput {
  to: string;
  fullName: string;
  link: string;
}

/** Payload for the forgot-password reset email. */
export interface PasswordResetEmailInput {
  to: string;
  fullName: string;
  link: string;
}

/** Payload for the "a payroll run needs your approval" notification. */
export interface PayrollApprovalEmailInput {
  to: string;
  approverName: string;
  /** Pay period in YYYY-MM form. */
  period: string;
  headcount: number;
  /** Total net pay, pre-formatted as a VND string (e.g. "350.000.000"). */
  totalNet: string;
  link: string;
}

/** Payload for a lifecycle-reminder email (probation ending / contract expiring). */
export interface ReminderEmailInput {
  to: string;
  recipientName: string;
  employeeName: string;
  /** Target date, pre-formatted as dd/MM/yyyy. */
  dueDate: string;
  /** Whole days from today until the due date (0 = today). */
  daysUntil: number;
  link: string;
}

/** Abstraction over the email transport so callers don't depend on Resend. */
export interface EmailProvider {
  sendInvite(input: InviteEmailInput): Promise<void>;
  sendPasswordReset(input: PasswordResetEmailInput): Promise<void>;
  sendPayrollApprovalRequest(input: PayrollApprovalEmailInput): Promise<void>;
  sendProbationReminder(input: ReminderEmailInput): Promise<void>;
  sendContractReminder(input: ReminderEmailInput): Promise<void>;
  /** Generic transactional email (SPEC-045 sales outreach). Plain-text body → HTML. */
  sendRaw(input: { to: string; subject: string; body: string }): Promise<void>;
}

/** Escape HTML special chars so user-controlled values can't inject markup. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Minimal HTML body for the invite. Kept inline — no template engine yet. */
function inviteHtml(fullName: string, link: string): string {
  return [
    `<p>Xin chào ${escapeHtml(fullName)},</p>`,
    '<p>Tài khoản của bạn trên hệ thống HRM đã được tạo. ',
    'Vui lòng đặt mật khẩu để kích hoạt tài khoản:</p>',
    `<p><a href="${link}">Đặt mật khẩu &amp; kích hoạt</a></p>`,
    '<p>Liên kết này sẽ hết hạn sau 7 ngày.</p>',
  ].join('');
}

/** Minimal HTML body for the password reset. Link is single-use, 1-hour TTL. */
function passwordResetHtml(fullName: string, link: string): string {
  return [
    `<p>Xin chào ${escapeHtml(fullName)},</p>`,
    '<p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản HRM của bạn. ',
    'Nhấn vào liên kết bên dưới để chọn mật khẩu mới:</p>',
    `<p><a href="${link}">Đặt lại mật khẩu</a></p>`,
    '<p>Liên kết này sẽ hết hạn sau 1 giờ. ',
    'Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu của bạn không thay đổi.</p>',
  ].join('');
}

/** Minimal HTML body for the payroll-approval notification. */
function payrollApprovalHtml(input: PayrollApprovalEmailInput): string {
  const { approverName, period, headcount, totalNet, link } = input;
  return [
    `<p>Xin chào ${escapeHtml(approverName)},</p>`,
    `<p>Một kỳ lương đang chờ bạn phê duyệt:</p>`,
    '<ul>',
    `<li>Kỳ lương: <strong>${escapeHtml(period)}</strong></li>`,
    `<li>Số nhân viên: <strong>${headcount}</strong></li>`,
    `<li>Tổng thực nhận: <strong>${escapeHtml(totalNet)} ₫</strong></li>`,
    '</ul>',
    `<p><a href="${link}">Xem &amp; phê duyệt kỳ lương</a></p>`,
  ].join('');
}

/** Vietnamese "in N days" suffix for the reminder email subject/body. */
function reminderDaysSuffix(daysUntil: number): string {
  return daysUntil === 0 ? 'hôm nay' : `còn ${daysUntil} ngày`;
}

/** Minimal HTML body shared by both lifecycle-reminder emails. */
function reminderHtml(input: ReminderEmailInput, lead: string, tail: string): string {
  const { recipientName, employeeName, dueDate, daysUntil, link } = input;
  return [
    `<p>Xin chào ${escapeHtml(recipientName)},</p>`,
    `<p>${lead} <strong>${escapeHtml(employeeName)}</strong> ${tail} `,
    `vào <strong>${escapeHtml(dueDate)}</strong> (${reminderDaysSuffix(daysUntil)}).</p>`,
    `<p><a href="${link}">Xem chi tiết trên HRM</a></p>`,
  ].join('');
}

/**
 * Resend-backed provider. When RESEND_API_KEY is absent (typical for local dev)
 * the provider logs a warning and no-ops instead of throwing, so importing
 * employees locally doesn't fail just because email isn't configured.
 */
class ResendEmailProvider implements EmailProvider {
  private client: Resend | null;

  constructor(apiKey: string) {
    this.client = apiKey ? new Resend(apiKey) : null;
  }

  async sendRaw({ to, subject, body }: { to: string; subject: string; body: string }): Promise<void> {
    if (!this.client) {
      logger.warn({ event: 'email.sales.skipped', to }, 'RESEND_API_KEY not set — skipping sales email');
      return;
    }
    const html = `<div style="font-family:sans-serif;white-space:pre-wrap">${escapeHtml(body)}</div>`;
    const { error } = await this.client.emails.send({ from: EMAIL_FROM, to, subject, html });
    if (error) {
      throw new Error(`Resend failed to send sales email to ${to}: ${error.message}`);
    }
    logger.info({ event: 'email.sales.sent', to }, 'Sales email sent');
  }

  async sendInvite({ to, fullName, link }: InviteEmailInput): Promise<void> {
    if (!this.client) {
      logger.warn(
        { event: 'email.invite.skipped', to },
        'RESEND_API_KEY not set — skipping invite email',
      );
      return;
    }

    const { error } = await this.client.emails.send({
      from: EMAIL_FROM,
      to,
      subject: 'Kích hoạt tài khoản HRM của bạn',
      html: inviteHtml(fullName, link),
    });

    if (error) {
      // Surface so the queue's retry/backoff can take over.
      throw new Error(`Resend failed to send invite to ${to}: ${error.message}`);
    }

    logger.info({ event: 'email.invite.sent', to }, 'Invite email sent');
  }

  async sendPasswordReset({ to, fullName, link }: PasswordResetEmailInput): Promise<void> {
    if (!this.client) {
      logger.warn(
        { event: 'email.reset.skipped', to },
        'RESEND_API_KEY not set — skipping password reset email',
      );
      return;
    }

    const { error } = await this.client.emails.send({
      from: EMAIL_FROM,
      to,
      subject: 'Đặt lại mật khẩu HRM của bạn',
      html: passwordResetHtml(fullName, link),
    });

    if (error) {
      throw new Error(`Resend failed to send password reset to ${to}: ${error.message}`);
    }

    logger.info({ event: 'email.reset.sent', to }, 'Password reset email sent');
  }

  async sendPayrollApprovalRequest(input: PayrollApprovalEmailInput): Promise<void> {
    const { to, period } = input;
    if (!this.client) {
      logger.warn(
        { event: 'email.payroll_approval.skipped', to, period },
        'RESEND_API_KEY not set — skipping payroll approval email',
      );
      return;
    }

    const { error } = await this.client.emails.send({
      from: EMAIL_FROM,
      to,
      subject: `Kỳ lương ${period} chờ bạn phê duyệt`,
      html: payrollApprovalHtml(input),
    });

    if (error) {
      throw new Error(`Resend failed to send payroll approval to ${to}: ${error.message}`);
    }

    logger.info({ event: 'email.payroll_approval.sent', to, period }, 'Payroll approval email sent');
  }

  async sendProbationReminder(input: ReminderEmailInput): Promise<void> {
    const { to, employeeName } = input;
    if (!this.client) {
      logger.warn(
        { event: 'email.probation_reminder.skipped', to, employeeName },
        'RESEND_API_KEY not set — skipping probation reminder email',
      );
      return;
    }

    const { error } = await this.client.emails.send({
      from: EMAIL_FROM,
      to,
      subject: `Nhắc: ${employeeName} sắp hết thử việc`,
      html: reminderHtml(input, 'Nhân viên', 'sắp kết thúc thời gian thử việc'),
    });

    if (error) {
      throw new Error(`Resend failed to send probation reminder to ${to}: ${error.message}`);
    }

    logger.info(
      { event: 'email.probation_reminder.sent', to, employeeName },
      'Probation reminder email sent',
    );
  }

  async sendContractReminder(input: ReminderEmailInput): Promise<void> {
    const { to, employeeName } = input;
    if (!this.client) {
      logger.warn(
        { event: 'email.contract_reminder.skipped', to, employeeName },
        'RESEND_API_KEY not set — skipping contract reminder email',
      );
      return;
    }

    const { error } = await this.client.emails.send({
      from: EMAIL_FROM,
      to,
      subject: `Nhắc: hợp đồng của ${employeeName} sắp hết hạn`,
      html: reminderHtml(input, 'Hợp đồng của', 'sắp hết hạn'),
    });

    if (error) {
      throw new Error(`Resend failed to send contract reminder to ${to}: ${error.message}`);
    }

    logger.info(
      { event: 'email.contract_reminder.sent', to, employeeName },
      'Contract reminder email sent',
    );
  }
}

/**
 * Build a provider for a given key. Exposed so tests can exercise the keyless
 * no-op path deterministically without depending on the ambient RESEND_API_KEY.
 */
export function createEmailProvider(apiKey: string): EmailProvider {
  return new ResendEmailProvider(apiKey);
}

/** Process-wide singleton provider. */
export const emailProvider: EmailProvider = createEmailProvider(RESEND_API_KEY);
