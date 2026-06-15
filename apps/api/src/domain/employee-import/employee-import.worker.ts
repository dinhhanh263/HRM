import { Worker, type Job } from 'bullmq';
import type { ImportJobResult } from '@hrm/shared';
import { createQueueConnection } from '../../infrastructure/queue/connection.js';
import {
  IMPORT_QUEUE_NAME,
  IMPORT_WORKER_CHUNK_SIZE,
} from '../../shared/configs/import.config.js';
import { getStagedImport, discardStagedImport } from './employee-import.staging.js';
import { processImport, type CreatedUser } from './employee-import.processor.js';
import type { ImportJobData } from './employee-import.queue.js';
import { enqueueInvites, type InviteJobData } from './employee-import.invite.queue.js';

/**
 * Process one import job: load the staged rows, run the two-pass import, report
 * progress, and discard the staging entry. The returned result becomes the job's
 * `returnvalue`, surfaced by `GET /employees/import/:jobId`.
 */
async function handleImportJob(job: Job<ImportJobData>): Promise<ImportJobResult> {
  const { importId, tenantId } = job.data;

  const staged = await getStagedImport(importId, tenantId);
  if (!staged) {
    // Expired or already consumed — treat as a no-op rather than a hard failure.
    return { total: 0, created: 0, skipped: 0, failed: 0, errors: [] };
  }

  // Throttle progress writes to one per chunk (and a final one) so a 5,000-row
  // run doesn't hammer Redis with thousands of updateProgress calls.
  const onProgress = (done: number, total: number): void => {
    if (done === total || done % IMPORT_WORKER_CHUNK_SIZE === 0) {
      void job.updateProgress({ done, total });
    }
  };

  // Collect created users, then fan out invite emails as a separate queue after
  // the import finishes — sending email is decoupled from employee creation.
  const created: CreatedUser[] = [];
  const onUserCreated = (user: CreatedUser): void => {
    created.push(user);
  };

  const result = await processImport(
    tenantId,
    staged.rows,
    staged.options,
    onProgress,
    onUserCreated,
  );

  await discardStagedImport(importId);

  const invites: InviteJobData[] = created.map((u) => ({
    userId: u.userId,
    tenantId,
    email: u.email,
    fullName: u.fullName,
  }));
  await enqueueInvites(invites);

  return result;
}

/**
 * Start the import worker. Called once at server startup (and in tests). The
 * caller owns the returned Worker and must `close()` it on shutdown.
 */
export function createImportWorker(): Worker<ImportJobData, ImportJobResult> {
  return new Worker<ImportJobData, ImportJobResult>(IMPORT_QUEUE_NAME, handleImportJob, {
    connection: createQueueConnection(),
    concurrency: 1, // imports are write-heavy; serialize to keep code allocation safe
  });
}
