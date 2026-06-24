/**
 * SPEC-041: generic blob storage factory. Parameterises the same local/GCS
 * backends the CV storage uses (url prefix, key subdir, allowed MIME→ext map) so
 * new attachment types (payment invoices, …) get local↔GCS switching for free
 * without copy-pasting driver logic. The CV storage keeps its own dedicated
 * modules untouched (production-critical, separately tested); this factory powers
 * everything new.
 *
 * fileUrl format is `${urlPrefix}/<uuid>.<ext>`; for GCS it maps to object key
 * `${subdir}/<uuid>.<ext>` — backend-agnostic, so the DB column never migrates.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import * as path from 'node:path';
import { extname } from 'node:path';
import { Storage } from '@google-cloud/storage';
import { STORAGE_DRIVER, GCS_BUCKET, GCP_PROJECT_ID } from '../../shared/configs/cv.config.js';
import type { CvStorageDriver, StoredFile, CvReadStream } from './cv-storage.types.js';

export interface BlobStorageConfig {
  /** Public URL prefix, e.g. `/uploads/payment`. */
  urlPrefix: string;
  /** GCS object-key subdir, e.g. `payment`. */
  subdir: string;
  /** Local disk dir (relative to cwd) used when STORAGE_DRIVER=local. */
  storageDir: string;
  /** Accepted MIME→extension pairs; drives safe extension + content-type. */
  allowed: { mime: string; ext: string }[];
}

function mimeHelpers(config: BlobStorageConfig) {
  const extByMime = new Map(config.allowed.map((a) => [a.mime, a.ext]));
  const mimeByExt = new Map(config.allowed.map((a) => [a.ext, a.mime]));
  const allowedExts = new Set(config.allowed.map((a) => a.ext));

  return {
    /** Safe stored-file extension from the original name, falling back to MIME. */
    safeExt(originalName: string, mimeType: string): string {
      const fromName = extname(originalName).toLowerCase();
      if (allowedExts.has(fromName)) return fromName;
      return extByMime.get(mimeType) ?? '';
    },
    contentTypeFromUrl(fileUrl: string): string {
      return mimeByExt.get(extname(fileUrl).toLowerCase()) ?? 'application/octet-stream';
    },
  };
}

/** The bare `<uuid>.<ext>` name from a fileUrl, rejecting traversal/garbage. */
function fileName(fileUrl: string, urlPrefix: string): string | null {
  const prefix = `${urlPrefix}/`;
  if (!fileUrl.startsWith(prefix)) return null;
  const name = fileUrl.slice(prefix.length);
  if (!name || name.includes('/') || name.includes('..')) return null;
  return name;
}

function createLocalBlob(config: BlobStorageConfig): CvStorageDriver {
  const { safeExt, contentTypeFromUrl } = mimeHelpers(config);
  const resolveDiskPath = (fileUrl: string): string | null => {
    const name = fileName(fileUrl, config.urlPrefix);
    if (!name) return null;
    return path.join(path.resolve(process.cwd(), config.storageDir), name);
  };
  const requirePath = (fileUrl: string): string => {
    const p = resolveDiskPath(fileUrl);
    if (!p) throw new Error(`Invalid fileUrl: ${fileUrl}`);
    return p;
  };

  return {
    async store(buffer, originalName, mimeType) {
      const dir = path.resolve(process.cwd(), config.storageDir);
      await mkdir(dir, { recursive: true });
      const storedName = `${randomUUID()}${safeExt(originalName, mimeType)}`;
      await writeFile(path.join(dir, storedName), buffer);
      return { fileUrl: `${config.urlPrefix}/${storedName}` } satisfies StoredFile;
    },
    async read(fileUrl) {
      return readFile(requirePath(fileUrl));
    },
    async createReadStream(fileUrl): Promise<CvReadStream> {
      return { stream: createReadStream(requirePath(fileUrl)), contentType: contentTypeFromUrl(fileUrl) };
    },
    async remove(fileUrl) {
      const p = resolveDiskPath(fileUrl);
      if (!p) return;
      try {
        await unlink(p);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    },
  };
}

function createGcsBlob(config: BlobStorageConfig, bucketName = GCS_BUCKET, storage?: Storage): CvStorageDriver {
  if (!bucketName) {
    throw new Error('STORAGE_DRIVER=gcs requires GCS_BUCKET to be set');
  }
  const { safeExt, contentTypeFromUrl } = mimeHelpers(config);
  const client = storage ?? new Storage(GCP_PROJECT_ID ? { projectId: GCP_PROJECT_ID } : {});
  const bucket = client.bucket(bucketName);
  const toKey = (fileUrl: string): string => {
    const name = fileName(fileUrl, config.urlPrefix);
    if (!name) throw new Error(`Invalid fileUrl: ${fileUrl}`);
    return `${config.subdir}/${name}`;
  };

  return {
    async store(buffer, originalName, mimeType) {
      const storedName = `${randomUUID()}${safeExt(originalName, mimeType)}`;
      await bucket.file(`${config.subdir}/${storedName}`).save(buffer, { contentType: mimeType, resumable: false });
      return { fileUrl: `${config.urlPrefix}/${storedName}` } satisfies StoredFile;
    },
    async read(fileUrl) {
      const [contents] = await bucket.file(toKey(fileUrl)).download();
      return contents;
    },
    async createReadStream(fileUrl): Promise<CvReadStream> {
      return { stream: bucket.file(toKey(fileUrl)).createReadStream(), contentType: contentTypeFromUrl(fileUrl) };
    },
    async remove(fileUrl) {
      await bucket.file(toKey(fileUrl)).delete({ ignoreNotFound: true });
    },
  };
}

/** Build a driver for `config`, picking local/gcs from STORAGE_DRIVER. Throws on
 *  an unknown driver name so a typo can never silently fall back to local disk. */
export function createBlobStorage(config: BlobStorageConfig, driverName: string = STORAGE_DRIVER): CvStorageDriver {
  if (driverName === 'gcs') return createGcsBlob(config);
  if (driverName === 'local') return createLocalBlob(config);
  throw new Error(`Unknown STORAGE_DRIVER: "${driverName}" (expected 'local' or 'gcs')`);
}

// Exported for unit tests (inject a fake Storage / force a driver).
export const __test = { createLocalBlob, createGcsBlob, mimeHelpers };
