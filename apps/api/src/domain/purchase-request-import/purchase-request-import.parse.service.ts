import {
  PR_ITEM_IMPORT_ERROR_CODES,
  type PRItemImportParseResult,
  type PRItemImportPreviewRow,
  type PRItemImportRowError,
  type ValidatedPRItemRow,
} from '@hrm/shared';
import { PR_ITEM_IMPORT_MAX_ROWS } from '../../shared/configs/purchase-request-import.config.js';
import { parsePRItemFile, type ImportFileFormat } from './purchase-request-import.parser.js';
import { validatePRItemRows } from './purchase-request-import.validator.js';

function fileErrorResult(
  fileErrors: PRItemImportRowError[],
  totalRows = 0,
): PRItemImportParseResult {
  return {
    totalRows,
    validCount: 0,
    errorCount: fileErrors.length,
    fileErrors,
    rows: [],
    items: [],
  };
}

/**
 * Dry-run a line-item import file: parse → pure per-row validation. Writes
 * NOTHING and touches no database. Returns the clean rows inline (`items`) for
 * the client to merge into the New Purchase Request form; error rows are
 * reported per-row so the user can fix the file. Valid rows are returned even
 * when other rows fail (partial import is allowed by design).
 */
export async function parsePRItemImportFile(
  buffer: Buffer,
  format: ImportFileFormat,
): Promise<PRItemImportParseResult> {
  // 1) Parse. File-level problems (unreadable/empty/missing columns) end here.
  const { rows, errors: fileErrors } = await parsePRItemFile(buffer, format);
  if (fileErrors.length > 0) {
    return fileErrorResult(fileErrors);
  }

  // 2) Hard cap on row count (a request may hold at most this many items).
  if (rows.length > PR_ITEM_IMPORT_MAX_ROWS) {
    return fileErrorResult(
      [
        {
          row: 0,
          column: null,
          code: PR_ITEM_IMPORT_ERROR_CODES.TOO_MANY_ROWS,
          message: `File has ${rows.length} rows; the maximum is ${PR_ITEM_IMPORT_MAX_ROWS}`,
        },
      ],
      rows.length,
    );
  }

  // 3) Pure per-row validation.
  const validations = validatePRItemRows(rows);

  const items: ValidatedPRItemRow[] = [];
  const previewRows: PRItemImportPreviewRow[] = [];
  for (const v of validations) {
    previewRows.push({ rowNumber: v.rowNumber, data: v.data, errors: v.errors });
    if (v.item) items.push(v.item);
  }
  const errorCount = previewRows.reduce((n, r) => n + r.errors.length, 0);

  return {
    totalRows: rows.length,
    validCount: items.length,
    errorCount,
    fileErrors: [],
    rows: previewRows,
    items,
  };
}
