/**
 * CV file storage facade. Picks a driver once from STORAGE_DRIVER (`local`
 * default, `gcs` for production) and exposes verb functions the recruitment
 * services and CV-parse worker call. Callers never see disk paths or bucket
 * keys — only the stable `fileUrl` — so changing the backend is a config switch.
 */
import { STORAGE_DRIVER } from '../../shared/configs/cv.config.js';
import type { CvStorageDriver, CvReadStream, StoredFile } from './cv-storage.types.js';
import { localCvStorage } from './local-cv-storage.js';
import { createGcsCvStorage } from './gcs-cv-storage.js';

// Exported for unit testing; defaults to the configured driver at boot.
// Throws on an unknown name so a typo in STORAGE_DRIVER (e.g. "gcs ", "s3")
// can never silently fall back to ephemeral local disk in production.
export function selectDriver(name: string = STORAGE_DRIVER): CvStorageDriver {
  if (name === 'gcs') return createGcsCvStorage();
  if (name === 'local') return localCvStorage;
  throw new Error(`Unknown STORAGE_DRIVER: "${name}" (expected 'local' or 'gcs')`);
}

const driver = selectDriver();

export function storeCvFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<StoredFile> {
  return driver.store(buffer, originalName, mimeType);
}

export function readCvFile(fileUrl: string): Promise<Buffer> {
  return driver.read(fileUrl);
}

export function createCvReadStream(fileUrl: string): Promise<CvReadStream> {
  return driver.createReadStream(fileUrl);
}

export function deleteCvFile(fileUrl: string): Promise<void> {
  return driver.remove(fileUrl);
}
