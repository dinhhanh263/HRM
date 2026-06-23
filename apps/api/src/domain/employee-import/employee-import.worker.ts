import { getStagedImport, discardStagedImport } from './employee-import.staging.js';
import { processImport, type CreatedUser } from './employee-import.processor.js';
import { importJobRepository } from './import-job.repository.js';
import { IMPORT_WORKER_CHUNK_SIZE } from '../../shared/configs/import.config.js';
import type { ImportJobData } from './employee-import.queue.js';
import { enqueueInvites, type InviteJobData } from './employee-import.invite.queue.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * Process one import task: mark active, load staged rows, run the two-pass
 * import while persisting progress, store the result, discard staging, then fan
 * out invite emails. Failures are recorded as `failed` (no retry — import is
 * not idempotent at the row level; BullMQ used attempts:1 for the same reason).
 */
export async function employeeImportHandler(payload: unknown): Promise<void> {
  const { jobId, importId, tenantId } = payload as ImportJobData;

  try {
    // Inside the try so a transient failure here still records `failed` rather
    // than stranding the job in `waiting` (the queue does not retry imports).
    await importJobRepository.markActive(jobId);

    const staged = await getStagedImport(importId, tenantId);
    if (!staged) {
      await importJobRepository.markCompleted(jobId, { total: 0, created: 0, skipped: 0, failed: 0, errors: [] });
      return;
    }

    const onProgress = (done: number, total: number): void => {
      if (done === total || done % IMPORT_WORKER_CHUNK_SIZE === 0) {
        // Best-effort progress write; never let it crash the import.
        void importJobRepository.setProgress(jobId, { done, total }).catch((err) => {
          logger.warn({ err, jobId }, 'failed to persist import progress');
        });
      }
    };

    const created: CreatedUser[] = [];
    const onUserCreated = (user: CreatedUser): void => { created.push(user); };

    const result = await processImport(tenantId, staged.rows, staged.options, onProgress, onUserCreated);
    await discardStagedImport(importId);
    await importJobRepository.markCompleted(jobId, result);

    const invites: InviteJobData[] = created.map((u) => ({
      userId: u.userId, tenantId, email: u.email, fullName: u.fullName,
    }));
    await enqueueInvites(invites);
  } catch (err) {
    logger.error({ err, jobId }, 'employee import failed');
    await importJobRepository.markFailed(jobId, err instanceof Error ? err.message : 'import failed');
  }
}
