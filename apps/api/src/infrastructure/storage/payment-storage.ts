/**
 * SPEC-041: storage facade for payment-request attachments (invoices/bills).
 * Built on the generic blob-storage factory — local↔GCS switches via the same
 * STORAGE_DRIVER env as CV. Callers only ever handle the stable `fileUrl`.
 */
import { createBlobStorage } from './blob-storage.js';
import type { CvReadStream, StoredFile } from './cv-storage.types.js';
import {
  PAYMENT_URL_PREFIX,
  PAYMENT_STORAGE_DIR,
  PAYMENT_ALLOWED_MIME,
} from '../../shared/configs/payment.config.js';

const driver = createBlobStorage({
  urlPrefix: PAYMENT_URL_PREFIX,
  subdir: 'payment',
  storageDir: PAYMENT_STORAGE_DIR,
  allowed: PAYMENT_ALLOWED_MIME,
});

export function storePaymentFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<StoredFile> {
  return driver.store(buffer, originalName, mimeType);
}

export function createPaymentReadStream(fileUrl: string): Promise<CvReadStream> {
  return driver.createReadStream(fileUrl);
}

export function deletePaymentFile(fileUrl: string): Promise<void> {
  return driver.remove(fileUrl);
}
