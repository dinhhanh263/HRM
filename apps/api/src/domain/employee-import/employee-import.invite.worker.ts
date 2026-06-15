import { Worker, type Job } from 'bullmq';
import { createQueueConnection } from '../../infrastructure/queue/connection.js';
import { INVITE_QUEUE_NAME, buildSetPasswordLink } from '../../shared/configs/email.config.js';
import { emailProvider } from '../../infrastructure/email/email.provider.js';
import { authService } from '../services/auth.service.js';
import type { InviteJobData } from './employee-import.invite.queue.js';

/**
 * Process one invite job: mint a one-time invite token for the user, build the
 * set-password link, and send the invite email. Errors propagate so BullMQ's
 * retry/backoff applies. Concurrency is higher than the import worker because
 * sending email is I/O-bound and order-independent.
 */
async function handleInviteJob(job: Job<InviteJobData>): Promise<void> {
  const { userId, email, fullName } = job.data;

  const { token } = await authService.issueInvite(userId);
  const link = buildSetPasswordLink(token);

  await emailProvider.sendInvite({ to: email, fullName, link });
}

/**
 * Start the invite worker. Called once at server startup (and in tests). The
 * caller owns the returned Worker and must `close()` it on shutdown.
 */
export function createInviteWorker(): Worker<InviteJobData, void> {
  return new Worker<InviteJobData, void>(INVITE_QUEUE_NAME, handleInviteJob, {
    connection: createQueueConnection(),
    concurrency: 5,
  });
}
