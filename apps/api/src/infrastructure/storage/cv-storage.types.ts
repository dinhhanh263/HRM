/**
 * Storage backend contract for candidate CV files. The recruitment services and
 * the CV-parse worker depend only on this interface, never on where bytes live —
 * so swapping the local-disk driver for GCS in production is a config switch
 * (STORAGE_DRIVER) with no caller changes.
 *
 * `fileUrl` is the stable handle persisted in the DB
 * (`candidate_attachments.file_url`, `cv_import_items.file_url`). Its format
 * (`/uploads/cv/<uuid>.<ext>`) is identical across drivers so the column never
 * needs migrating when the backend changes.
 */
import type { Readable } from 'node:stream';

export interface StoredFile {
  /** Stable handle persisted in the DB and handed back to callers. */
  fileUrl: string;
}

export interface CvReadStream {
  stream: Readable;
  /** MIME type derived from the stored file's extension, for the response header. */
  contentType: string;
}

export interface CvStorageDriver {
  /** Persist an uploaded CV buffer; returns its stable fileUrl. */
  store(buffer: Buffer, originalName: string, mimeType: string): Promise<StoredFile>;
  /** Read the full file back into memory (used for text extraction / parsing). */
  read(fileUrl: string): Promise<Buffer>;
  /** Open a read stream for serving the file to an authorised client. */
  createReadStream(fileUrl: string): Promise<CvReadStream>;
  /** Best-effort delete; a missing file must NOT throw (cancel paths rely on this). */
  remove(fileUrl: string): Promise<void>;
}
