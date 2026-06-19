import type { StagedImport } from '@hrm/shared';
import type { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';
import { IMPORT_STAGING_TTL_SECONDS } from '../../shared/configs/import.config.js';

/** Stage validated rows in Postgres between /validate and /import. */
export async function stageImport(payload: StagedImport): Promise<string> {
  const expiresAt = new Date(Date.now() + IMPORT_STAGING_TTL_SECONDS * 1000);
  const row = await db.importStaging.create({
    data: {
      tenantId: payload.tenantId,
      kind: 'employee',
      payload: payload as unknown as Prisma.InputJsonValue,
      expiresAt,
    },
  });
  return row.id;
}

/** Fetch a staged import; null if missing, expired (lazy), or cross-tenant. */
export async function getStagedImport(importId: string, tenantId: string): Promise<StagedImport | null> {
  const row = await db.importStaging.findUnique({ where: { id: importId } });
  if (!row || row.kind !== 'employee' || row.expiresAt < new Date()) return null;
  const parsed = row.payload as unknown as StagedImport;
  if (parsed.tenantId !== tenantId) return null;
  return parsed;
}

/** Remove a staged import after a successful enqueue. */
export async function discardStagedImport(importId: string): Promise<void> {
  await db.importStaging.deleteMany({ where: { id: importId } });
}

/** Delete all expired staging rows (employee + asset). Called by the daily scan. */
export async function purgeExpiredStaging(): Promise<number> {
  const { count } = await db.importStaging.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return count;
}
