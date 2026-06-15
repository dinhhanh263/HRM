// Caps for the asset bulk-import feature. Unlike employee import, the confirm
// step is a single synchronous, all-or-nothing `prisma.$transaction`, so the row
// cap is lower (the whole batch is one interactive transaction).

import { IMPORT_STAGING_TTL_SECONDS } from './import.config.js';

/** Maximum number of DATA rows (header excluded) accepted in one file. */
export const ASSET_IMPORT_MAX_ROWS = 2_000;

/** Redis key prefix for staged asset imports (separate from employee imports). */
export const ASSET_IMPORT_STAGING_PREFIX = 'hrm:v1:asset-import:staging';

/** Build the Redis staging key for a given asset-import id. */
export function assetImportStagingKey(importId: string): string {
  return `${ASSET_IMPORT_STAGING_PREFIX}:${importId}`;
}

/** Reuse the employee-import staging TTL (30 minutes). */
export { IMPORT_STAGING_TTL_SECONDS };
