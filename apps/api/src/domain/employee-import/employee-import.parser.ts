import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import {
  IMPORT_COLUMNS,
  IMPORT_COLUMN_LABELS,
  IMPORT_ERROR_CODES,
  REQUIRED_IMPORT_COLUMNS,
  type ImportColumn,
  type ImportRowError,
  type ParsedImportRow,
} from '@hrm/shared';

export type ImportFileFormat = 'xlsx' | 'csv';

export interface ParseResult {
  rows: ParsedImportRow[];
  /** File-level problems (unreadable, empty, missing required columns). */
  errors: ImportRowError[];
}

const REQUIRED_COLUMNS: readonly ImportColumn[] = REQUIRED_IMPORT_COLUMNS;

// Header text (normalized) -> canonical column key. The English canonical keys
// double as the default template headers; localized header support can be
// layered on at template time without changing this core.
const HEADER_ALIASES: Record<string, ImportColumn> = {};
for (const col of IMPORT_COLUMNS) {
  HEADER_ALIASES[col.toLowerCase()] = col;
}

function normalizeHeader(value: string): string {
  // Strip the "required" asterisk (templates render e.g. "Email *") and any
  // spacing/underscores/dashes so "Full Name", "full_name" and "Họ và tên *"
  // all resolve to the same canonical column.
  return value.trim().toLowerCase().replace(/\*/g, '').replace(/[\s_-]+/g, '');
}

// Build a lookup that tolerates spacing/underscores in headers (e.g. "Full Name").
// Recognizes three header forms for each column: the canonical English key, and
// the localized vi/en labels written into the downloadable templates — so a
// filled-in template round-trips back through the importer regardless of language.
const HEADER_LOOKUP: Record<string, ImportColumn> = {};
for (const col of IMPORT_COLUMNS) {
  HEADER_LOOKUP[normalizeHeader(col)] = col;
  for (const label of Object.values(IMPORT_COLUMN_LABELS[col])) {
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
    // Keep every CSV cell as its raw string. ExcelJS's default CSV parser coerces
    // date-like text into a Date in the server's LOCAL timezone; cellToString then
    // renders it back via toISOString() (UTC), which rolls the calendar day back in
    // positive-offset zones (UTC+7: "2024-01-06" -> "2024-01-05"). The validator
    // already accepts strict YYYY-MM-DD strings, so skipping date coercion entirely
    // keeps dates timezone-stable. (XLSX is unaffected: ExcelJS stores those cells
    // as UTC-midnight Dates, which toISOString renders correctly.)
    return workbook.csv.read(Readable.from(buffer), { map: (datum) => datum });
  }
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook.worksheets[0];
}

/**
 * Parse an .xlsx or .csv buffer into normalized rows. Pure-ish: reads bytes,
 * no DB. Header row maps columns by name (case/spacing-insensitive); unknown
 * columns are ignored. Each data row becomes a fully-keyed ParsedImportRow with
 * trimmed values and a lowercased email. Returns file-level errors separately.
 */
export async function parseEmployeeFile(
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
          code: IMPORT_ERROR_CODES.UNREADABLE_FILE,
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
          code: IMPORT_ERROR_CODES.EMPTY_FILE,
          message: 'The file contains no data',
        },
      ],
    };
  }

  // --- Header row -> column index map ---
  const headerRow = worksheet.getRow(1);
  const columnByIndex = new Map<number, ImportColumn>();
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
          code: IMPORT_ERROR_CODES.MISSING_COLUMNS,
          message: `Missing required column(s): ${missing.join(', ')}`,
        },
      ],
    };
  }

  // --- Data rows ---
  const rows: ParsedImportRow[] = [];
  let dataRowNumber = 0;
  const lastRow = worksheet.rowCount;
  for (let r = 2; r <= lastRow; r++) {
    const row = worksheet.getRow(r);
    const values: Record<ImportColumn, string> = {
      fullName: '',
      email: '',
      dateOfBirth: '',
      gender: '',
      idNumber: '',
      phone: '',
      department: '',
      position: '',
      manager: '',
      joinDate: '',
      contractType: '',
      dependentsCount: '',
      role: '',
      placeOfBirth: '',
      idIssueDate: '',
      idIssuePlace: '',
      personalEmail: '',
      education: '',
      maritalStatus: '',
      permanentAddress: '',
      currentAddress: '',
      emergencyContactName: '',
      emergencyContactRelationship: '',
      emergencyContactPhone: '',
      bankAccountNumber: '',
      bankName: '',
      bankBranch: '',
      taxCode: '',
      socialInsuranceNumber: '',
      healthcareFacility: '',
      motorbikeRegistration: '',
    };
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
      email: values.email.toLowerCase(),
    });
  }

  if (rows.length === 0) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          column: null,
          code: IMPORT_ERROR_CODES.EMPTY_FILE,
          message: 'The file contains a header but no data rows',
        },
      ],
    };
  }

  return { rows, errors: [] };
}
