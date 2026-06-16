/**
 * Google Cloud Storage CV driver (production). Authenticates via Application
 * Default Credentials — on GCP this is the service account attached to the
 * Cloud Run/GKE workload (Workload Identity), so there are NO static access
 * keys in the environment. Locally, `gcloud auth application-default login`.
 *
 * Object key = `cv/<uuid>.<ext>`, derived from the same fileUrl format the local
 * driver uses (`/uploads/cv/<uuid>.<ext>`), so the persisted DB column is
 * backend-agnostic and never needs migrating.
 */
import { randomUUID } from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import { CV_URL_PREFIX, GCS_BUCKET, GCP_PROJECT_ID } from '../../shared/configs/cv.config.js';
import type { CvStorageDriver, StoredFile, CvReadStream } from './cv-storage.types.js';
import { safeExt, contentTypeFromUrl } from './cv-mime.js';

/** Map a stored fileUrl to its GCS object key, rejecting traversal/garbage. */
function fileUrlToKey(fileUrl: string): string {
  const prefix = `${CV_URL_PREFIX}/`;
  if (!fileUrl.startsWith(prefix)) throw new Error(`Invalid CV fileUrl: ${fileUrl}`);
  const name = fileUrl.slice(prefix.length);
  if (!name || name.includes('/') || name.includes('..')) {
    throw new Error(`Invalid CV fileUrl: ${fileUrl}`);
  }
  return `cv/${name}`;
}

/**
 * Build a GCS-backed CvStorageDriver. Throws immediately if no bucket is
 * configured so a misconfigured production fails fast at boot rather than
 * silently falling back to ephemeral local disk.
 *
 * `storage` is injectable for unit tests; in production it is left undefined and
 * a real Storage client (ADC) is created.
 */
export function createGcsCvStorage(
  bucketName: string = GCS_BUCKET,
  storage?: Storage
): CvStorageDriver {
  if (!bucketName) {
    throw new Error('STORAGE_DRIVER=gcs requires GCS_BUCKET to be set');
  }
  const client = storage ?? new Storage(GCP_PROJECT_ID ? { projectId: GCP_PROJECT_ID } : {});
  const bucket = client.bucket(bucketName);

  return {
    async store(buffer: Buffer, originalName: string, mimeType: string): Promise<StoredFile> {
      const storedName = `${randomUUID()}${safeExt(originalName, mimeType)}`;
      await bucket.file(`cv/${storedName}`).save(buffer, {
        contentType: mimeType,
        resumable: false,
      });
      return { fileUrl: `${CV_URL_PREFIX}/${storedName}` };
    },

    async read(fileUrl: string): Promise<Buffer> {
      const [contents] = await bucket.file(fileUrlToKey(fileUrl)).download();
      return contents;
    },

    async createReadStream(fileUrl: string): Promise<CvReadStream> {
      const stream = bucket.file(fileUrlToKey(fileUrl)).createReadStream();
      return { stream, contentType: contentTypeFromUrl(fileUrl) };
    },

    async remove(fileUrl: string): Promise<void> {
      await bucket.file(fileUrlToKey(fileUrl)).delete({ ignoreNotFound: true });
    },
  };
}
