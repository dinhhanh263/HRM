// Final caps for the employee bulk-import feature. Kept in one place so they
// are easy to tune later. Values match SPEC-006 defaults.

/** Maximum number of DATA rows (header excluded) accepted in one file. */
export const IMPORT_MAX_ROWS = 5_000;

/** Maximum upload size in bytes (5 MB). Enforced by multer + a guard. */
export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;

/** How long staged (validated) rows live in Redis between /validate and /import. */
export const IMPORT_STAGING_TTL_SECONDS = 30 * 60; // 30 minutes

/** Redis key prefix for staged imports. See naming-conventions.md. */
export const IMPORT_STAGING_PREFIX = 'hrm:v1:import:staging';

/** Build the Redis staging key for a given import id. */
export function importStagingKey(importId: string): string {
  return `${IMPORT_STAGING_PREFIX}:${importId}`;
}

/** BullMQ queue name for the background import worker. See naming-conventions.md. */
export const IMPORT_QUEUE_NAME = 'hrm.employee.import';

/** The named job within the import queue. */
export const IMPORT_JOB_NAME = 'process-import';

/**
 * How long a finished job (and its result) is retained in the queue before
 * BullMQ removes it. 24h gives the wizard ample time to poll the outcome.
 */
export const IMPORT_JOB_RETENTION_SECONDS = 24 * 60 * 60;

/** How many rows the worker writes per chunk before yielding a progress update. */
export const IMPORT_WORKER_CHUNK_SIZE = 200;
