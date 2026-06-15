import { Queue } from 'bullmq';
import { createQueueConnection } from '../../infrastructure/queue/connection.js';
import {
  INVITE_QUEUE_NAME,
  INVITE_JOB_NAME,
  INVITE_JOB_RETENTION_SECONDS,
} from '../../shared/configs/email.config.js';

/** Payload for one invite email job. Carries enough to render the email so the
 * worker needn't re-fetch the user just for its name. */
export interface InviteJobData {
  userId: string;
  tenantId: string;
  email: string;
  fullName: string;
}

let queue: Queue<InviteJobData> | null = null;

/** Lazily-constructed singleton invite queue (opens Redis only on first use). */
export function getInviteQueue(): Queue<InviteJobData> {
  if (!queue) {
    queue = new Queue<InviteJobData>(INVITE_QUEUE_NAME, {
      connection: createQueueConnection(),
      defaultJobOptions: {
        // Transient email failures are worth a couple of backed-off retries.
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: INVITE_JOB_RETENTION_SECONDS },
        removeOnFail: { age: INVITE_JOB_RETENTION_SECONDS },
      },
    });
  }
  return queue;
}

/** Enqueue invite emails for a batch of freshly-created users. */
export async function enqueueInvites(jobs: InviteJobData[]): Promise<void> {
  if (jobs.length === 0) return;
  await getInviteQueue().addBulk(
    jobs.map((data) => ({ name: INVITE_JOB_NAME, data })),
  );
}
