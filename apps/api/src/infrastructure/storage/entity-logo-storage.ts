/**
 * SPEC-043: storage facade for issuing-entity logos (PNG/JPEG only). Built on the
 * generic blob-storage factory — local↔GCS switches via the same STORAGE_DRIVER
 * env as CV/payment/purchase. Callers only ever handle the stable `logoUrl`.
 *
 * `readEntityLogo` loads the full image into a Buffer so the PO PDF can embed it
 * via `doc.image(buffer, …)` server-side (no HTTP round-trip).
 */
import { createBlobStorage } from './blob-storage.js';
import type { CvReadStream, StoredFile } from './cv-storage.types.js';
import {
  ENTITY_LOGO_URL_PREFIX,
  ENTITY_LOGO_STORAGE_DIR,
  ENTITY_LOGO_ALLOWED_MIME,
} from '../../shared/configs/entity-logo.config.js';

const driver = createBlobStorage({
  urlPrefix: ENTITY_LOGO_URL_PREFIX,
  subdir: 'entity-logo',
  storageDir: ENTITY_LOGO_STORAGE_DIR,
  allowed: ENTITY_LOGO_ALLOWED_MIME,
});

export function storeEntityLogo(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<StoredFile> {
  return driver.store(buffer, originalName, mimeType);
}

/** Read the logo bytes into memory — used by the PO PDF to embed via doc.image. */
export function readEntityLogo(logoUrl: string): Promise<Buffer> {
  return driver.read(logoUrl);
}

export function createEntityLogoReadStream(logoUrl: string): Promise<CvReadStream> {
  return driver.createReadStream(logoUrl);
}

export function deleteEntityLogo(logoUrl: string): Promise<void> {
  return driver.remove(logoUrl);
}
