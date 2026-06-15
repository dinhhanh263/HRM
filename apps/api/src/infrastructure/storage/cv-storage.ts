/**
 * CV file storage. In development files land on local disk under CV_STORAGE_DIR;
 * the service only ever receives back a public fileUrl, so swapping in S3/R2 for
 * production is a matter of reimplementing this module — callers don't change.
 */

import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import * as path from 'node:path';
import { CV_STORAGE_DIR, CV_URL_PREFIX } from '../../shared/configs/cv.config.js';

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

export interface StoredFile {
  /** Public URL the API serves the file under. */
  fileUrl: string;
  /** Absolute path on disk (dev only) — used by the download handler. */
  diskPath: string;
}

function safeExt(originalName: string, mimeType: string): string {
  const fromName = extname(originalName).toLowerCase();
  if (fromName === '.pdf' || fromName === '.docx') return fromName;
  return EXT_BY_MIME[mimeType] ?? '';
}

/**
 * Persist an uploaded CV buffer and return its public URL + disk path.
 * The stored filename is a random UUID so user-supplied names can never cause
 * path traversal or collisions.
 */
export async function storeCvFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<StoredFile> {
  const dir = path.resolve(process.cwd(), CV_STORAGE_DIR);
  await mkdir(dir, { recursive: true });

  const storedName = `${randomUUID()}${safeExt(originalName, mimeType)}`;
  const diskPath = path.join(dir, storedName);
  await writeFile(diskPath, buffer);

  return { fileUrl: `${CV_URL_PREFIX}/${storedName}`, diskPath };
}

/** Resolve a stored fileUrl back to an absolute disk path for download. */
export function resolveCvDiskPath(fileUrl: string): string | null {
  const prefix = `${CV_URL_PREFIX}/`;
  if (!fileUrl.startsWith(prefix)) return null;
  const name = fileUrl.slice(prefix.length);
  // Reject anything that isn't a bare filename (no slashes / traversal).
  if (!name || name.includes('/') || name.includes('..')) return null;
  return path.join(path.resolve(process.cwd(), CV_STORAGE_DIR), name);
}

/**
 * Best-effort delete of a stored CV file. Used when a bulk-import batch is
 * cancelled and its staged files are no longer needed. A missing file is not an
 * error — cleanup must never throw and block the cancel.
 */
export async function deleteCvFile(fileUrl: string): Promise<void> {
  const diskPath = resolveCvDiskPath(fileUrl);
  if (!diskPath) return;
  try {
    await unlink(diskPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
