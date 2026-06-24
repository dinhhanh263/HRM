/**
 * SPEC-042: storage facade for purchase-request attachments (quotes/contracts).
 * Built on the generic blob-storage factory — local↔GCS switches via the same
 * STORAGE_DRIVER env as CV/payment. Callers only ever handle the stable `fileUrl`.
 */
import { createBlobStorage } from './blob-storage.js';
import type { CvReadStream, StoredFile } from './cv-storage.types.js';
import {
  PURCHASE_URL_PREFIX,
  PURCHASE_STORAGE_DIR,
  PURCHASE_ALLOWED_MIME,
} from '../../shared/configs/purchase.config.js';

const driver = createBlobStorage({
  urlPrefix: PURCHASE_URL_PREFIX,
  subdir: 'purchase',
  storageDir: PURCHASE_STORAGE_DIR,
  allowed: PURCHASE_ALLOWED_MIME,
});

export function storePurchaseFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<StoredFile> {
  return driver.store(buffer, originalName, mimeType);
}

export function createPurchaseReadStream(fileUrl: string): Promise<CvReadStream> {
  return driver.createReadStream(fileUrl);
}

export function deletePurchaseFile(fileUrl: string): Promise<void> {
  return driver.remove(fileUrl);
}
