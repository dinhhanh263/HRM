import { randomUUID } from 'node:crypto';
import type { StagedAssetImport } from '@hrm/shared';
import { redis } from '../../infrastructure/cache/redis.js';
import {
  IMPORT_STAGING_TTL_SECONDS,
  assetImportStagingKey,
} from '../../shared/configs/asset-import.config.js';

/**
 * Stage validated rows in Redis between `/validate` and `/import` so the atomic
 * confirm doesn't have to re-upload + re-parse the file. Returns the generated
 * import id used as the staging key. Entries expire after IMPORT_STAGING_TTL_SECONDS.
 */
export async function stageAssetImport(payload: StagedAssetImport): Promise<string> {
  const importId = randomUUID();
  await redis.set(
    assetImportStagingKey(importId),
    JSON.stringify(payload),
    'EX',
    IMPORT_STAGING_TTL_SECONDS,
  );
  return importId;
}

/**
 * Fetch a staged asset import by id. Returns null if it expired or never existed,
 * or if it belongs to a different tenant (defensive cross-tenant guard).
 */
export async function getStagedAssetImport(
  importId: string,
  tenantId: string,
): Promise<StagedAssetImport | null> {
  const raw = await redis.get(assetImportStagingKey(importId));
  if (!raw) return null;
  const parsed = JSON.parse(raw) as StagedAssetImport;
  if (parsed.tenantId !== tenantId) return null;
  return parsed;
}

/** Remove a staged asset import (after a successful atomic commit). */
export async function discardStagedAssetImport(importId: string): Promise<void> {
  await redis.del(assetImportStagingKey(importId));
}
