// Purchase-request line-item import — shared contract between the API (parser +
// pure validator + stateless parse service) and the web import sheet. Unlike
// employee/asset import this NEVER touches the database: the parsed rows are
// returned straight to the New Purchase Request form, merged into the field
// array, and only persisted when the user submits the request the normal way
// (POST /purchase-requests). Hence there is no staging, no job, and no
// DB-dependent error codes here. Error codes are stable machine strings the web
// client maps to i18n messages (vi/en).

import type { ImportLang } from './employee-import.js';
import type { PurchaseRequestItemInput } from './purchase-request.js';

export type { ImportLang };

/** Stable, machine-readable validation error codes for PR item import. */
export const PR_ITEM_IMPORT_ERROR_CODES = {
  // File-level guards
  FILE_TOO_LARGE: 'IMPORT_FILE_TOO_LARGE',
  TOO_MANY_ROWS: 'IMPORT_TOO_MANY_ROWS',
  EMPTY_FILE: 'IMPORT_EMPTY_FILE',
  UNREADABLE_FILE: 'IMPORT_UNREADABLE_FILE',
  MISSING_COLUMNS: 'IMPORT_MISSING_COLUMNS',
  // Per-row validation (pure)
  MISSING_REQUIRED: 'IMPORT_MISSING_REQUIRED',
  INVALID_NUMBER: 'IMPORT_INVALID_NUMBER',
  QUANTITY_NOT_POSITIVE: 'IMPORT_QUANTITY_NOT_POSITIVE',
  UNIT_PRICE_NEGATIVE: 'IMPORT_UNIT_PRICE_NEGATIVE',
  TAX_RATE_RANGE: 'IMPORT_TAX_RATE_RANGE',
  TOO_LONG: 'IMPORT_TOO_LONG',
} as const;

export type PRItemImportErrorCode =
  (typeof PR_ITEM_IMPORT_ERROR_CODES)[keyof typeof PR_ITEM_IMPORT_ERROR_CODES];

/** Canonical import column keys (also the template header keys). Order matches
 *  the on-screen line-item row so a filled template reads left-to-right. */
export const PR_ITEM_IMPORT_COLUMNS = [
  'productName',
  'sku',
  'unit',
  'quantity',
  'unitPrice',
  'taxRate',
] as const;

export type PRItemImportColumn = (typeof PR_ITEM_IMPORT_COLUMNS)[number];

/** Columns that must carry a value for a row to be importable. */
export const REQUIRED_PR_ITEM_IMPORT_COLUMNS = [
  'productName',
  'quantity',
  'unitPrice',
] as const satisfies readonly PRItemImportColumn[];

/** Localized header labels written into the templates; the parser also accepts
 *  them as aliases so a filled-in localized template re-imports cleanly. */
export const PR_ITEM_IMPORT_COLUMN_LABELS: Record<
  PRItemImportColumn,
  Record<ImportLang, string>
> = {
  productName: { vi: 'Tên sản phẩm', en: 'Product name' },
  sku: { vi: 'Mã SKU', en: 'SKU' },
  unit: { vi: 'Đơn vị', en: 'Unit' },
  quantity: { vi: 'Số lượng', en: 'Quantity' },
  unitPrice: { vi: 'Đơn giá', en: 'Unit price' },
  taxRate: { vi: 'Thuế (%)', en: 'Tax rate (%)' },
};

/** Default VAT applied when the taxRate cell is left blank (matches the create
 *  form's default and the Prisma column default). */
export const PR_ITEM_IMPORT_DEFAULT_TAX_RATE = 8;

/** A single parsed row, normalized (trimmed). `rowNumber` is the 1-based
 *  spreadsheet data row (header excluded) for error reporting. */
export interface ParsedPRItemRow {
  rowNumber: number;
  productName: string;
  sku: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
}

/** A row that passed every check — shaped exactly like the create payload item
 *  so the client can drop it straight into the form field array. */
export type ValidatedPRItemRow = PurchaseRequestItemInput;

/** One validation problem tied to a row (and optionally a column). */
export interface PRItemImportRowError {
  row: number;
  column: PRItemImportColumn | null;
  code: PRItemImportErrorCode;
  message: string;
}

/** A preview row for the sheet table: the raw cell values plus any errors. */
export interface PRItemImportPreviewRow {
  rowNumber: number;
  data: Record<PRItemImportColumn, string>;
  errors: PRItemImportRowError[];
}

/**
 * Result of `POST /purchase-requests/import/parse`. Pure dry-run: NO DB writes,
 * NO staging. Valid rows are returned inline for the client to append to the
 * form; error rows are reported so the user can fix the file (or type them in).
 */
export interface PRItemImportParseResult {
  totalRows: number;
  validCount: number;
  errorCount: number;
  /** File-level problems (unreadable/empty/missing columns/too many rows). */
  fileErrors: PRItemImportRowError[];
  /** Per data-row preview with inline errors. */
  rows: PRItemImportPreviewRow[];
  /** The clean rows, ready to merge into the form (empty when any file error). */
  items: ValidatedPRItemRow[];
}
