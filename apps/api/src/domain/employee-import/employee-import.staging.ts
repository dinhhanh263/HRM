import { randomUUID } from 'node:crypto';
import type { StagedImport } from '@hrm/shared';
import { redis } from '../../infrastructure/cache/redis.js';
import {
  IMPORT_STAGING_TTL_SECONDS,
  importStagingKey,
} from '../../shared/configs/import.config.js';

/**
 * Stage validated rows in Redis between `/validate` and `/import` so a 5,000-row
 * confirmation doesn't have to re-upload the file. Returns the generated import
 * id used as the staging key. Entries expire after IMPORT_STAGING_TTL_SECONDS.
 */
export async function stageImport(payload: StagedImport): Promise<string> {
  const importId = randomUUID();
  await redis.set(
    importStagingKey(importId),
    JSON.stringify(payload),
    'EX',
    IMPORT_STAGING_TTL_SECONDS,
  );
  return importId;
}

/**
 * Fetch a staged import by id. Returns null if it expired or never existed, or
 * if it belongs to a different tenant (defensive cross-tenant guard).
 */
export async function getStagedImport(
  importId: string,
  tenantId: string,
): Promise<StagedImport | null> {
  const raw = await redis.get(importStagingKey(importId));
  if (!raw) return null;
  const parsed = JSON.parse(raw) as StagedImport;
  if (parsed.tenantId !== tenantId) return null;
  return parsed;
}

/** Remove a staged import (after a successful enqueue). */
export async function discardStagedImport(importId: string): Promise<void> {
  await redis.del(importStagingKey(importId));
}
