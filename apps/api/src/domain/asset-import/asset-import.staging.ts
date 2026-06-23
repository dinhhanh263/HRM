import type { StagedAssetImport } from '@hrm/shared';
import type { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';
import { IMPORT_STAGING_TTL_SECONDS } from '../../shared/configs/import.config.js';

export async function stageAssetImport(payload: StagedAssetImport): Promise<string> {
  const expiresAt = new Date(Date.now() + IMPORT_STAGING_TTL_SECONDS * 1000);
  const row = await db.importStaging.create({
    data: {
      tenantId: payload.tenantId,
      kind: 'asset',
      payload: payload as unknown as Prisma.InputJsonValue,
      expiresAt,
    },
  });
  return row.id;
}

export async function getStagedAssetImport(importId: string, tenantId: string): Promise<StagedAssetImport | null> {
  const row = await db.importStaging.findUnique({ where: { id: importId } });
  if (!row || row.kind !== 'asset' || row.expiresAt < new Date()) return null;
  const parsed = row.payload as unknown as StagedAssetImport;
  if (parsed.tenantId !== tenantId) return null;
  return parsed;
}

export async function discardStagedAssetImport(importId: string): Promise<void> {
  await db.importStaging.deleteMany({ where: { id: importId } });
}
