import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import {
  ASSET_IMPORT_COLUMNS,
  ASSET_IMPORT_COLUMN_LABELS,
  ASSET_IMPORT_ERROR_CODES,
  REQUIRED_ASSET_IMPORT_COLUMNS,
  type AssetImportColumn,
  type AssetImportRowError,
  type ParsedAssetImportRow,
} from '@hrm/shared';

export type ImportFileFormat = 'xlsx' | 'csv';

export interface ParseResult {
  rows: ParsedAssetImportRow[];
  /** File-level problems (unreadable, empty, missing required columns). */
  errors: AssetImportRowError[];
}

const REQUIRED_COLUMNS: readonly AssetImportColumn[] = REQUIRED_ASSET_IMPORT_COLUMNS;

function normalizeHeader(value: string): string {
  // Strip the "required" asterisk (templates render e.g. "Mã tài sản *") and any
  // spacing/underscores/dashes so "Asset code", "asset_code" and "Mã tài sản *"
  // all resolve to the same canonical column.
  return value.trim().toLowerCase().replace(/\*/g, '').replace(/[\s_-]+/g, '');
}

// Build a lookup that tolerates spacing/underscores in headers. Recognizes the
// canonical English key plus the localized vi/en labels written into templates,
// so a filled-in template round-trips back through the importer in any language.
const HEADER_LOOKUP: Record<string, AssetImportColumn> = {};
for (const col of ASSET_IMPORT_COLUMNS) {
  HEADER_LOOKUP[normalizeHeader(col)] = col;
  for (const label of Object.values(ASSET_IMPORT_COLUMN_LABELS[col])) {
    HEADER_LOOKUP[normalizeHeader(label)] = col;
  }
}

/** Coerce any ExcelJS cell value into a plain trimmed string. */
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    // Render as YYYY-MM-DD (UTC) so date-typed cells stay comparable to text.
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'object') {
    // Rich text, hyperlink, or formula result objects.
    const obj = value as unknown as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text.trim();
    if (typeof obj.result !== 'undefined' && obj.result !== null) {
      return String(obj.result).trim();
    }
    if (Array.isArray((obj as { richText?: unknown }).richText)) {
      const parts = (obj as { richText: { text?: string }[] }).richText;
      return parts.map((p) => p.text ?? '').join('').trim();
    }
    return '';
  }
  return String(value).trim();
}

async function loadWorksheet(
  buffer: Buffer,
  format: ImportFileFormat,
): Promise<ExcelJS.Worksheet | undefined> {
  const workbook = new ExcelJS.Workbook();
  if (format === 'csv') {
    return workbook.csv.read(Readable.from(buffer));
  }
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook.worksheets[0];
}

function emptyRowValues(): Record<AssetImportColumn, string> {
  const values = {} as Record<AssetImportColumn, string>;
  for (const col of ASSET_IMPORT_COLUMNS) values[col] = '';
  return values;
}

/**
 * Parse an .xlsx or .csv buffer into normalized rows. Pure: reads bytes, no DB.
 * Header row maps columns by name (case/spacing-insensitive); unknown columns are
 * ignored. Each data row becomes a fully-keyed ParsedAssetImportRow with trimmed
 * values and an uppercased assetCode. Returns file-level errors separately.
 */
export async function parseAssetFile(
  buffer: Buffer,
  format: ImportFileFormat,
): Promise<ParseResult> {
  let worksheet: ExcelJS.Worksheet | undefined;
  try {
    worksheet = await loadWorksheet(buffer, format);
  } catch {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          column: null,
          code: ASSET_IMPORT_ERROR_CODES.UNREADABLE_FILE,
          message: 'The file could not be read as a valid spreadsheet',
        },
      ],
    };
  }

  if (!worksheet || worksheet.rowCount === 0) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          column: null,
          code: ASSET_IMPORT_ERROR_CODES.EMPTY_FILE,
          message: 'The file contains no data',
        },
      ],
    };
  }

  // --- Header row -> column index map ---
  const headerRow = worksheet.getRow(1);
  const columnByIndex = new Map<number, AssetImportColumn>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = HEADER_LOOKUP[normalizeHeader(cellToString(cell.value))];
    if (key && !Array.from(columnByIndex.values()).includes(key)) {
      columnByIndex.set(colNumber, key);
    }
  });

  const presentColumns = new Set(columnByIndex.values());
  const missing = REQUIRED_COLUMNS.filter((c) => !presentColumns.has(c));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          column: null,
          code: ASSET_IMPORT_ERROR_CODES.MISSING_COLUMNS,
          message: `Missing required column(s): ${missing.join(', ')}`,
        },
      ],
    };
  }

  // --- Data rows ---
  const rows: ParsedAssetImportRow[] = [];
  let dataRowNumber = 0;
  const lastRow = worksheet.rowCount;
  for (let r = 2; r <= lastRow; r++) {
    const row = worksheet.getRow(r);
    const values = emptyRowValues();
    let hasAnyValue = false;
    for (const [colIndex, key] of columnByIndex) {
      const text = cellToString(row.getCell(colIndex).value);
      if (text) hasAnyValue = true;
      values[key] = text;
    }

    // Skip fully-blank rows (trailing spreadsheet padding).
    if (!hasAnyValue) continue;

    dataRowNumber += 1;
    rows.push({
      rowNumber: dataRowNumber,
      ...values,
      // Normalize assetCode (uppercase + trim) consistently with the create
      // schema regex so in-file dedupe and DB compare are case-stable. Owner is
      // left as-typed (only trimmed): it may be an email (matched case-insensitively
      // later) OR an uppercase employeeCode (matched exactly), so we must not
      // lowercase it here.
      assetCode: values.assetCode.toUpperCase(),
    });
  }

  if (rows.length === 0) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          column: null,
          code: ASSET_IMPORT_ERROR_CODES.EMPTY_FILE,
          message: 'The file contains a header but no data rows',
        },
      ],
    };
  }

  return { rows, errors: [] };
}
