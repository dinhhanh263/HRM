import { Queue } from 'bullmq';
import type {
  ImportJobProgress,
  ImportJobResult,
  ImportJobState,
  ImportJobStatus,
} from '@hrm/shared';
import { createQueueConnection } from '../../infrastructure/queue/connection.js';
import {
  IMPORT_QUEUE_NAME,
  IMPORT_JOB_NAME,
  IMPORT_JOB_RETENTION_SECONDS,
} from '../../shared/configs/import.config.js';

/** Payload carried on every import job. The validated rows themselves live in
 * Redis under `importId` (staged by /validate) — the worker reads them there. */
export interface ImportJobData {
  importId: string;
  tenantId: string;
}

let queue: Queue<ImportJobData> | null = null;

/** Lazily-constructed singleton queue (so importing this module doesn't open a
 * Redis socket until the queue is actually used). */
export function getImportQueue(): Queue<ImportJobData> {
  if (!queue) {
    queue = new Queue<ImportJobData>(IMPORT_QUEUE_NAME, {
      connection: createQueueConnection(),
      defaultJobOptions: {
        attempts: 1, // the worker handles per-row failures itself; no blind retry
        removeOnComplete: { age: IMPORT_JOB_RETENTION_SECONDS },
        removeOnFail: { age: IMPORT_JOB_RETENTION_SECONDS },
      },
    });
  }
  return queue;
}

/** Enqueue a staged import for background processing. Returns the queue job id. */
export async function enqueueImport(data: ImportJobData): Promise<string> {
  const job = await getImportQueue().add(IMPORT_JOB_NAME, data);
  return job.id!;
}

/** Normalize BullMQ's many internal states into the public lifecycle set. */
function normalizeState(raw: string): ImportJobState {
  switch (raw) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'active':
      return 'active';
    case 'waiting':
    case 'waiting-children':
    case 'delayed':
    case 'prioritized':
      return 'waiting';
    default:
      return 'unknown';
  }
}

/** A BullMQ progress value is `unknown`; accept only our {done,total} shape. */
function asProgress(value: unknown): ImportJobProgress | null {
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ImportJobProgress).done === 'number' &&
    typeof (value as ImportJobProgress).total === 'number'
  ) {
    const { done, total } = value as ImportJobProgress;
    return { done, total };
  }
  return null;
}

/**
 * Read a job's status for the polling endpoint. Returns null when the job id is
 * unknown (expired/retention-evicted or never existed) so the controller can 404.
 *
 * Tenant-scoped: a job belongs to the tenant that enqueued it (`job.data.tenantId`).
 * Callers pass their own tenantId; a mismatch is treated as "not found" so an
 * authenticated user cannot enumerate integer job ids to read another tenant's
 * import result (which carries employee emails). Isolation, not just 404 cosmetics.
 */
export async function getImportJobStatus(
  jobId: string,
  tenantId: string,
): Promise<ImportJobStatus | null> {
  const job = await getImportQueue().getJob(jobId);
  if (!job) return null;
  if (job.data.tenantId !== tenantId) return null;

  const state = normalizeState(await job.getState());
  return {
    jobId,
    state,
    progress: state === 'active' ? asProgress(job.progress) : null,
    result: state === 'completed' ? (job.returnvalue as ImportJobResult) : null,
  };
}
