import { buildSetPasswordLink } from '../../shared/configs/email.config.js';
import { emailProvider } from '../../infrastructure/email/email.provider.js';
import { authService } from '../services/auth.service.js';
import type { InviteJobData } from './employee-import.invite.queue.js';

/** Mint a one-time invite token, build the set-password link, send the email.
 * Throwing → router 500 → Cloud Tasks retry (queue maxAttempts=3). */
export async function inviteHandler(payload: unknown): Promise<void> {
  const { userId, email, fullName } = payload as InviteJobData;
  const { token } = await authService.issueInvite(userId);
  await emailProvider.sendInvite({ to: email, fullName, link: buildSetPasswordLink(token) });
}
