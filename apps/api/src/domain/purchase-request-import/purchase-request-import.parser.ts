import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import {
  PR_ITEM_IMPORT_COLUMNS,
  PR_ITEM_IMPORT_COLUMN_LABELS,
  PR_ITEM_IMPORT_ERROR_CODES,
  REQUIRED_PR_ITEM_IMPORT_COLUMNS,
  type PRItemImportColumn,
  type PRItemImportRowError,
  type ParsedPRItemRow,
} from '@hrm/shared';

export type ImportFileFormat = 'xlsx' | 'csv';

export interface PRItemParseResult {
  rows: ParsedPRItemRow[];
  /** File-level problems (unreadable, empty, missing required columns). */
  errors: PRItemImportRowError[];
}

const REQUIRED_COLUMNS: readonly PRItemImportColumn[] = REQUIRED_PR_ITEM_IMPORT_COLUMNS;

function normalizeHeader(value: string): string {
  // Strip the "required" asterisk (templates render e.g. "Tên sản phẩm *") and
  // any spacing/underscores/dashes so "Product name", "product_name" and
  // "Tên sản phẩm *" all resolve to the same canonical column.
  return value.trim().toLowerCase().replace(/\*/g, '').replace(/[\s_-]+/g, '');
}

// Build a lookup that tolerates spacing/underscores in headers. Recognizes the
// canonical English key plus the localized vi/en labels written into templates,
// so a filled-in template round-trips back through the importer in any language.
const HEADER_LOOKUP: Record<string, PRItemImportColumn> = {};
for (const col of PR_ITEM_IMPORT_COLUMNS) {
  HEADER_LOOKUP[normalizeHeader(col)] = col;
  for (const label of Object.values(PR_ITEM_IMPORT_COLUMN_LABELS[col])) {
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

function emptyRowValues(): Record<PRItemImportColumn, string> {
  const values = {} as Record<PRItemImportColumn, string>;
  for (const col of PR_ITEM_IMPORT_COLUMNS) values[col] = '';
  return values;
}

/**
 * Parse an .xlsx or .csv buffer into normalized rows. Pure: reads bytes, no DB.
 * Header row maps columns by name (case/spacing-insensitive); unknown columns
 * are ignored. Each data row becomes a fully-keyed ParsedPRItemRow with trimmed
 * values. Returns file-level errors separately.
 */
export async function parsePRItemFile(
  buffer: Buffer,
  format: ImportFileFormat,
): Promise<PRItemParseResult> {
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
          code: PR_ITEM_IMPORT_ERROR_CODES.UNREADABLE_FILE,
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
          code: PR_ITEM_IMPORT_ERROR_CODES.EMPTY_FILE,
          message: 'The file contains no data',
        },
      ],
    };
  }

  // --- Header row -> column index map ---
  const headerRow = worksheet.getRow(1);
  const columnByIndex = new Map<number, PRItemImportColumn>();
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
          code: PR_ITEM_IMPORT_ERROR_CODES.MISSING_COLUMNS,
          message: `Missing required column(s): ${missing.join(', ')}`,
        },
      ],
    };
  }

  // --- Data rows ---
  const rows: ParsedPRItemRow[] = [];
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
    rows.push({ rowNumber: dataRowNumber, ...values });
  }

  if (rows.length === 0) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          column: null,
          code: PR_ITEM_IMPORT_ERROR_CODES.EMPTY_FILE,
          message: 'The file contains a header but no data rows',
        },
      ],
    };
  }

  return { rows, errors: [] };
}
