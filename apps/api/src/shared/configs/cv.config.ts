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
 * Local disk directory (relative to the API process cwd) where CV files are
 * stored in development. In production this is replaced by S3/R2; the service
 * only ever hands out fileUrl, so callers don't depend on the backend.
 */
export const CV_STORAGE_DIR = process.env.CV_STORAGE_DIR || 'storage/cv';

/** Public URL prefix the API serves stored CV files under. */
export const CV_URL_PREFIX = '/uploads/cv';
