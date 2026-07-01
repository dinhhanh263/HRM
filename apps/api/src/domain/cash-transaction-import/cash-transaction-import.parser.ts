import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import {
  CASH_TX_IMPORT_COLUMNS,
  REQUIRED_CASH_TX_IMPORT_COLUMNS,
  type CashTxImportColumn,
  type CashTxImportLang,
  type CashTxImportRowError,
  type ParsedCashTxRow,
} from '@hrm/shared';

export type ImportFileFormat = 'xlsx' | 'csv';

// Localized header labels written into templates and recognized on import.
export const CASH_TX_COLUMN_LABELS: Record<CashTxImportColumn, Record<CashTxImportLang, string>> = {
  account: { vi: 'Tài khoản', en: 'Account' },
  direction: { vi: 'Loại (Thu/Chi)', en: 'Direction (In/Out)' },
  amount: { vi: 'Số tiền', en: 'Amount' },
  date: { vi: 'Ngày (YYYY-MM-DD)', en: 'Date (YYYY-MM-DD)' },
  category: { vi: 'Danh mục', en: 'Category' },
  department: { vi: 'Bộ phận', en: 'Department' },
  reference: { vi: 'Số chứng từ', en: 'Reference' },
  description: { vi: 'Mô tả', en: 'Description' },
};

export interface CashTxParseResult {
  rows: ParsedCashTxRow[];
  errors: CashTxImportRowError[]; // file-level problems
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\*/g, '').replace(/[\s_()/-]+/g, '');
}

const HEADER_LOOKUP: Record<string, CashTxImportColumn> = {};
for (const col of CASH_TX_IMPORT_COLUMNS) {
  HEADER_LOOKUP[normalizeHeader(col)] = col;
  for (const label of Object.values(CASH_TX_COLUMN_LABELS[col])) {
    HEADER_LOOKUP[normalizeHeader(label)] = col;
  }
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text.trim();
    if (obj.result !== undefined && obj.result !== null) return String(obj.result).trim();
    if (Array.isArray((obj as { richText?: unknown }).richText)) {
      return (obj as { richText: { text?: string }[] }).richText.map((p) => p.text ?? '').join('').trim();
    }
    return '';
  }
  return String(value).trim();
}

async function loadWorksheet(buffer: Buffer, format: ImportFileFormat) {
  const workbook = new ExcelJS.Workbook();
  if (format === 'csv') return workbook.csv.read(Readable.from(buffer));
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook.worksheets[0];
}

function fileError(code: string, message: string): CashTxParseResult {
  return { rows: [], errors: [{ row: 0, column: null, code, message }] };
}

function emptyValues(): Record<CashTxImportColumn, string> {
  const v = {} as Record<CashTxImportColumn, string>;
  for (const col of CASH_TX_IMPORT_COLUMNS) v[col] = '';
  return v;
}

/** Parse an .xlsx/.csv buffer into normalized rows. Pure — reads bytes, no DB. */
export async function parseCashTxFile(buffer: Buffer, format: ImportFileFormat): Promise<CashTxParseResult> {
  let worksheet: ExcelJS.Worksheet | undefined;
  try {
    worksheet = await loadWorksheet(buffer, format);
  } catch {
    return fileError('UNREADABLE_FILE', 'Không đọc được tệp — hãy dùng đúng mẫu .xlsx/.csv');
  }
  if (!worksheet || worksheet.rowCount === 0) {
    return fileError('EMPTY_FILE', 'Tệp không có dữ liệu');
  }

  const headerRow = worksheet.getRow(1);
  const columnByIndex = new Map<number, CashTxImportColumn>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = HEADER_LOOKUP[normalizeHeader(cellToString(cell.value))];
    if (key && !Array.from(columnByIndex.values()).includes(key)) columnByIndex.set(colNumber, key);
  });

  const present = new Set(columnByIndex.values());
  const missing = REQUIRED_CASH_TX_IMPORT_COLUMNS.filter((c) => !present.has(c));
  if (missing.length > 0) {
    return fileError('MISSING_COLUMNS', `Thiếu cột bắt buộc: ${missing.join(', ')}`);
  }

  const rows: ParsedCashTxRow[] = [];
  let dataRowNumber = 0;
  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const values = emptyValues();
    let hasAny = false;
    for (const [colIndex, key] of columnByIndex) {
      const text = cellToString(row.getCell(colIndex).value);
      if (text) hasAny = true;
      values[key] = text;
    }
    if (!hasAny) continue;
    dataRowNumber += 1;
    rows.push({ rowNumber: dataRowNumber, ...values });
  }

  if (rows.length === 0) return fileError('EMPTY_FILE', 'Tệp chỉ có tiêu đề, không có dòng dữ liệu');
  return { rows, errors: [] };
}
