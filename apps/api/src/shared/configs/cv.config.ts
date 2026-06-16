// Limits and storage config for candidate CV attachments. Kept in one place so
// they are easy to tune and so the upload middleware, service and tests agree.

/** Maximum CV upload size in bytes (10 MB). Enforced by multer + a guard. */
export const CV_MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Accepted CV mime types: PDF and DOCX only (legacy .doc is not supported). */
export const CV_ALLOWED_MIME = new Set<string>([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/**
 * Storage backend for CV files. `local` (default) writes to disk under
 * CV_STORAGE_DIR — used in development and tests so neither needs cloud
 * credentials. `gcs` stores objects in Google Cloud Storage for production.
 * Callers only ever hand out / consume fileUrl, so they don't depend on which.
 */
export const STORAGE_DRIVER = (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 'gcs';

/**
 * Local disk directory (relative to the API process cwd) where CV files are
 * stored when STORAGE_DRIVER=local.
 */
export const CV_STORAGE_DIR = process.env.CV_STORAGE_DIR || 'storage/cv';

/**
 * Public URL prefix CV fileUrls carry (`/uploads/cv/<uuid>.<ext>`). Identical
 * across drivers — for `gcs` it maps to the object key `cv/<uuid>.<ext>` — so
 * the persisted fileUrl never changes when the backend does.
 */
export const CV_URL_PREFIX = '/uploads/cv';

/** GCS bucket name; required when STORAGE_DRIVER=gcs. */
export const GCS_BUCKET = process.env.GCS_BUCKET || '';

/** GCP project id; optional when Application Default Credentials can infer it. */
export const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || '';
