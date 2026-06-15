import { Prisma } from '@prisma/client';
import { ASSET_IMPORT_ERROR_CODES, type AssetImportResult, type ValidatedAssetImportRow } from '@hrm/shared';
import { db } from '../../infrastructure/database/client.js';
import { AppError, BadRequestError, ConflictError } from '../../shared/errors/index.js';
import { assetImportRepository } from '../repositories/asset-import.repository.js';
import { getStagedAssetImport, discardStagedAssetImport } from './asset-import.staging.js';

/**
 * Atomically commit a staged asset import. Reads the validated rows staged in
 * Redis under `importId`, then creates every Asset (and an ACTIVE handover for
 * each owner row) inside a single `$transaction` — all-or-nothing. A row whose
 * `assetCode` was taken between validate and confirm (or whose category/owner
 * was deleted mid-flight) makes the whole batch roll back via the DB constraint.
 *
 * `actingEmployeeId` becomes the handover's `assignedById` and is REQUIRED only
 * when the batch contains owner rows (the FK is non-nullable). The staged entry
 * is discarded after a successful commit so an import cannot be replayed.
 */
export async function confirmAssetImport(
  tenantId: string,
  importId: string,
  actingEmployeeId: string | null,
): Promise<AssetImportResult> {
  const staged = await getStagedAssetImport(importId, tenantId);
  if (!staged) {
    throw new AppError(
      'Staged import not found or expired; please re-validate the file',
      404,
      ASSET_IMPORT_ERROR_CODES.STAGING_NOT_FOUND,
    );
  }

  const ownerRows = staged.rows.filter((r) => r.ownerEmployeeId !== null);
  if (ownerRows.length > 0 && !actingEmployeeId) {
    throw new BadRequestError(
      'An employee profile is required to record asset handovers',
      'NO_EMPLOYEE_PROFILE',
    );
  }

  try {
    await db.$transaction(async (tx) => {
      for (const row of staged.rows) {
        const assetId = await assetImportRepository.createAsset(tx, buildAssetData(tenantId, row));
        if (row.ownerEmployeeId) {
          await assetImportRepository.createAssignment(tx, {
            tenantId,
            assetId,
            employeeId: row.ownerEmployeeId,
            assignedById: actingEmployeeId!,
            assignedAt: new Date(row.assignedAt!),
            conditionOut: row.condition,
            note: row.note,
            status: 'ACTIVE',
            ackStatus: 'PENDING',
          });
        }
      }
    });
  } catch (err) {
    // Unique violation = an assetCode was created after validate (race). The
    // whole transaction has rolled back, so no partial import remains.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError(
        'An asset code in this file was just taken; please re-validate',
        ASSET_IMPORT_ERROR_CODES.ASSET_CODE_EXISTS,
      );
    }
    throw err;
  }

  await discardStagedAssetImport(importId);

  return {
    created: staged.rows.length,
    assignmentsCreated: ownerRows.length,
  };
}

/** Map a validated row to Prisma create input; owner rows start ASSIGNED. */
function buildAssetData(
  tenantId: string,
  row: ValidatedAssetImportRow,
): Prisma.AssetUncheckedCreateInput {
  return {
    tenantId,
    categoryId: row.categoryId,
    assetCode: row.assetCode,
    name: row.name,
    status: row.ownerEmployeeId ? 'ASSIGNED' : 'AVAILABLE',
    serialNumber: row.serialNumber,
    brand: row.brand,
    model: row.model,
    condition: row.condition,
    purchaseDate: row.purchaseDate ? new Date(row.purchaseDate) : null,
    purchaseCost: row.purchaseCost,
    warrantyEndDate: row.warrantyEndDate ? new Date(row.warrantyEndDate) : null,
    vendor: row.vendor,
    location: row.location,
    note: row.note,
  };
}
