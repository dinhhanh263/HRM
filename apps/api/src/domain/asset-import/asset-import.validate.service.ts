import {
  ASSET_IMPORT_ERROR_CODES,
  type AssetImportPreviewRow,
  type AssetImportRowError,
  type AssetImportValidationSummary,
  type ValidatedAssetImportRow,
} from '@hrm/shared';
import { ASSET_IMPORT_MAX_ROWS } from '../../shared/configs/asset-import.config.js';
import { assetImportRepository } from '../repositories/asset-import.repository.js';
import { parseAssetFile, type ImportFileFormat } from './asset-import.parser.js';
import { validateAssetRows } from './asset-import.validator.js';
import { stageAssetImport } from './asset-import.staging.js';

function fileErrorSummary(
  fileErrors: AssetImportRowError[],
  totalRows = 0,
): AssetImportValidationSummary {
  return {
    importId: null,
    totalRows,
    validCount: 0,
    errorCount: fileErrors.length,
    fileErrors,
    rows: [],
  };
}

/**
 * Dry-run a bulk asset import file: parse → per-row validation (pure) →
 * DB-dependent checks (assetCode already exists, category-by-code resolvable,
 * owner-by-email/code resolvable). Writes NOTHING to the database.
 *
 * The commit is atomic/all-or-nothing, so the rows are staged in Redis under a
 * fresh `importId` ONLY when the file is completely clean (errorCount === 0);
 * any error leaves `importId` null and the wizard blocks the confirm step.
 */
export async function validateAssetImportFile(
  tenantId: string,
  buffer: Buffer,
  format: ImportFileFormat,
): Promise<AssetImportValidationSummary> {
  // 1) Parse. File-level problems (unreadable/empty/missing columns) end here.
  const { rows, errors: fileErrors } = await parseAssetFile(buffer, format);
  if (fileErrors.length > 0) {
    return fileErrorSummary(fileErrors);
  }

  // 2) Hard cap on row count (the confirm is one interactive transaction).
  if (rows.length > ASSET_IMPORT_MAX_ROWS) {
    return fileErrorSummary(
      [
        {
          row: 0,
          column: null,
          code: ASSET_IMPORT_ERROR_CODES.TOO_MANY_ROWS,
          message: `File has ${rows.length} rows; the maximum is ${ASSET_IMPORT_MAX_ROWS}`,
        },
      ],
      rows.length,
    );
  }

  // 3) Pure per-row validation + in-file assetCode dedupe.
  const validations = validateAssetRows(rows);
  const drafts = validations.flatMap((v) => (v.draft ? [v.draft] : []));

  // 4) DB-dependent checks — batched so cost is O(queries), not O(rows).
  const assetCodes = drafts.map((d) => d.assetCode);
  const categoryCodes = Array.from(new Set(drafts.map((d) => d.categoryCode)));
  const ownerRefs = Array.from(
    new Set(drafts.map((d) => d.ownerRef).filter((v): v is string => v !== null)),
  );

  const [existingCodes, categoryIds, ownerIds] = await Promise.all([
    assetImportRepository.existingAssetCodes(tenantId, assetCodes),
    assetImportRepository.categoryIdsByCode(tenantId, categoryCodes),
    assetImportRepository.resolveOwnerIds(tenantId, ownerRefs),
  ]);

  // Resolve each clean draft. Rows that fail a DB check collect their errors
  // (keyed by row for the preview); rows that pass become validated rows.
  const extraErrorsByRow = new Map<number, AssetImportRowError[]>();
  const validatedRows: ValidatedAssetImportRow[] = [];

  for (const d of drafts) {
    const extra: AssetImportRowError[] = [];

    if (existingCodes.has(d.assetCode)) {
      extra.push({
        row: d.rowNumber,
        column: 'assetCode',
        code: ASSET_IMPORT_ERROR_CODES.ASSET_CODE_EXISTS,
        message: `An asset already exists with code ${d.assetCode}`,
      });
    }

    const categoryId = categoryIds.get(d.categoryCode);
    if (!categoryId) {
      extra.push({
        row: d.rowNumber,
        column: 'category',
        code: ASSET_IMPORT_ERROR_CODES.CATEGORY_NOT_FOUND,
        message: `Category code not found: ${d.categoryCode}`,
      });
    }

    let ownerEmployeeId: string | null = null;
    if (d.ownerRef) {
      ownerEmployeeId =
        ownerIds.get(d.ownerRef) ?? ownerIds.get(d.ownerRef.toLowerCase()) ?? null;
      if (!ownerEmployeeId) {
        extra.push({
          row: d.rowNumber,
          column: 'owner',
          code: ASSET_IMPORT_ERROR_CODES.OWNER_NOT_FOUND,
          message: `Owner not found among active employees (by email or employee code): ${d.ownerRef}`,
        });
      }
    }

    if (extra.length > 0) {
      extraErrorsByRow.set(d.rowNumber, extra);
      continue;
    }

    validatedRows.push({
      rowNumber: d.rowNumber,
      assetCode: d.assetCode,
      name: d.name,
      categoryId: categoryId!,
      serialNumber: d.serialNumber,
      brand: d.brand,
      model: d.model,
      condition: d.condition,
      purchaseDate: d.purchaseDate,
      purchaseCost: d.purchaseCost,
      warrantyEndDate: d.warrantyEndDate,
      vendor: d.vendor,
      location: d.location,
      note: d.note,
      ownerEmployeeId,
      assignedAt: ownerEmployeeId ? d.assignedAt : null,
    });
  }

  // 5) Build the preview: every data row, with pure errors + DB errors merged.
  const previewRows: AssetImportPreviewRow[] = validations.map((v) => ({
    rowNumber: v.rowNumber,
    data: v.data,
    errors: [...v.errors, ...(extraErrorsByRow.get(v.rowNumber) ?? [])],
  }));
  const errorCount = previewRows.reduce((n, r) => n + r.errors.length, 0);

  // 6) Stage only a fully-clean file (atomic import is all-or-nothing).
  let importId: string | null = null;
  if (errorCount === 0 && validatedRows.length > 0) {
    importId = await stageAssetImport({
      tenantId,
      createdAt: new Date().toISOString(),
      rows: validatedRows,
    });
  }

  return {
    importId,
    totalRows: rows.length,
    validCount: validatedRows.length,
    errorCount,
    fileErrors: [],
    rows: previewRows,
  };
}
