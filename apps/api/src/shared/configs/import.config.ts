// Final caps for the employee bulk-import feature. Kept in one place so they
// are easy to tune later. Values match SPEC-006 defaults.

/** Maximum number of DATA rows (header excluded) accepted in one file. */
export const IMPORT_MAX_ROWS = 5_000;

/** Maximum upload size in bytes (5 MB). Enforced by multer + a guard. */
export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;

/** How long staged (validated) rows live in Redis between /validate and /import. */
export const IMPORT_STAGING_TTL_SECONDS = 30 * 60; // 30 minutes

/** How many rows the worker writes per chunk before yielding a progress update. */
export const IMPORT_WORKER_CHUNK_SIZE = 200;
