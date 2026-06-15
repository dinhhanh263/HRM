// Asset bulk import — shared contract between the API (parser + validator +
// atomic import service) and the web import wizard. Unlike employee import, the
// commit is synchronous and all-or-nothing (single transaction); there is no
// background job, so no job-status types here. Error codes are stable machine
// strings the web client maps to i18n messages (vi/en).

import type { AssetCondition } from './asset.js';
import type { ImportLang } from './employee-import.js';

export type { ImportLang };

/** Stable, machine-readable validation error codes for asset import. */
export const ASSET_IMPORT_ERROR_CODES = {
  // File-level guards
  FILE_TOO_LARGE: 'IMPORT_FILE_TOO_LARGE',
  TOO_MANY_ROWS: 'IMPORT_TOO_MANY_ROWS',
  EMPTY_FILE: 'IMPORT_EMPTY_FILE',
  UNREADABLE_FILE: 'IMPORT_UNREADABLE_FILE',
  MISSING_COLUMNS: 'IMPORT_MISSING_COLUMNS',
  // Per-row validation (pure)
  MISSING_REQUIRED: 'IMPORT_MISSING_REQUIRED',
  INVALID_ASSET_CODE: 'IMPORT_INVALID_ASSET_CODE',
  INVALID_DATE: 'IMPORT_INVALID_DATE',
  INVALID_ENUM: 'IMPORT_INVALID_ENUM',
  INVALID_COST: 'IMPORT_INVALID_COST',
  ASSET_CODE_DUPLICATE_IN_FILE: 'IMPORT_ASSET_CODE_DUPLICATE_IN_FILE',
  OWNER_MISSING_ASSIGNED_DATE: 'IMPORT_OWNER_MISSING_ASSIGNED_DATE',
  // DB-dependent (resolved in the validate/import service)
  ASSET_CODE_EXISTS: 'IMPORT_ASSET_CODE_EXISTS',
  CATEGORY_NOT_FOUND: 'IMPORT_CATEGORY_NOT_FOUND',
  OWNER_NOT_FOUND: 'IMPORT_OWNER_NOT_FOUND',
  // Staging lifecycle (between /validate and /import)
  STAGING_NOT_FOUND: 'IMPORT_STAGING_NOT_FOUND',
  MISSING_IMPORT_ID: 'IMPORT_MISSING_IMPORT_ID',
} as const;

export type AssetImportErrorCode =
  (typeof ASSET_IMPORT_ERROR_CODES)[keyof typeof ASSET_IMPORT_ERROR_CODES];

/** Canonical import column keys (also the template header keys). */
export const ASSET_IMPORT_COLUMNS = [
  'assetCode',
  'name',
  'category',
  'serialNumber',
  'brand',
  'model',
  'condition',
  'purchaseDate',
  'purchaseCost',
  'warrantyEndDate',
  'vendor',
  'location',
  'note',
  'owner',
  'assignedAt',
] as const;

export type AssetImportColumn = (typeof ASSET_IMPORT_COLUMNS)[number];

/** Columns that must carry a value for a row to be importable. */
export const REQUIRED_ASSET_IMPORT_COLUMNS = [
  'assetCode',
  'name',
  'category',
] as const satisfies readonly AssetImportColumn[];

/** Localized header labels written into the templates; the parser also accepts
 *  them as aliases so a filled-in localized template re-imports cleanly. */
export const ASSET_IMPORT_COLUMN_LABELS: Record<AssetImportColumn, Record<ImportLang, string>> = {
  assetCode: { vi: 'Mã tài sản', en: 'Asset code' },
  name: { vi: 'Tên tài sản', en: 'Asset name' },
  category: { vi: 'Mã loại', en: 'Category code' },
  serialNumber: { vi: 'Số serial', en: 'Serial number' },
  brand: { vi: 'Hãng', en: 'Brand' },
  model: { vi: 'Model', en: 'Model' },
  condition: { vi: 'Tình trạng', en: 'Condition' },
  purchaseDate: { vi: 'Ngày mua', en: 'Purchase date' },
  purchaseCost: { vi: 'Nguyên giá (VND)', en: 'Purchase cost (VND)' },
  warrantyEndDate: { vi: 'Hết bảo hành', en: 'Warranty end date' },
  vendor: { vi: 'Nhà cung cấp', en: 'Vendor' },
  location: { vi: 'Vị trí', en: 'Location' },
  note: { vi: 'Ghi chú', en: 'Note' },
  owner: { vi: 'Người sở hữu (email/mã NV)', en: 'Owner (email/employee code)' },
  assignedAt: { vi: 'Ngày cấp phát', en: 'Assigned date' },
};

/** Allowed values for the dropdown (enum) columns in the template. */
export const ASSET_IMPORT_ENUM_OPTIONS = {
  condition: ['NEW', 'GOOD', 'FAIR', 'POOR'],
} as const satisfies Partial<Record<AssetImportColumn, readonly string[]>>;

/** A single parsed row, normalized (trimmed; assetCode uppercased). `rowNumber`
 *  is the 1-based spreadsheet row (header excluded) for error reporting. */
export interface ParsedAssetImportRow {
  rowNumber: number;
  assetCode: string;
  name: string;
  category: string;
  serialNumber: string;
  brand: string;
  model: string;
  condition: string;
  purchaseDate: string;
  purchaseCost: string;
  warrantyEndDate: string;
  vendor: string;
  location: string;
  note: string;
  owner: string;
  assignedAt: string;
}

/**
 * A row that passed every check. Carries resolved foreign keys (categoryId,
 * ownerEmployeeId) captured at validate time so the atomic import doesn't
 * re-query; assetCode uniqueness is still re-checked at confirm (race guard),
 * and FK constraints protect against a category/owner deleted mid-flight.
 */
export interface ValidatedAssetImportRow {
  rowNumber: number;
  assetCode: string;
  name: string;
  categoryId: string;
  serialNumber: string | null;
  brand: string | null;
  model: string | null;
  condition: AssetCondition | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  warrantyEndDate: string | null;
  vendor: string | null;
  location: string | null;
  note: string | null;
  /** Resolved owner employee id; null when no owner column value. */
  ownerEmployeeId: string | null;
  /** Required when ownerEmployeeId is set; ISO date string. */
  assignedAt: string | null;
}

/** One validation problem tied to a row (and optionally a column). */
export interface AssetImportRowError {
  row: number;
  column: AssetImportColumn | null;
  code: AssetImportErrorCode;
  message: string;
}

/** A preview row for the wizard table: the raw cell values plus any errors. */
export interface AssetImportPreviewRow {
  rowNumber: number;
  data: Record<AssetImportColumn, string>;
  errors: AssetImportRowError[];
}

/**
 * Dry-run result of `POST /assets/import/validate`. No DB writes happen to
 * produce it. When every row is valid (errorCount === 0), the validated rows
 * are staged in Redis under `importId` so `/import` can reference them without
 * re-uploading. `importId` is null whenever there is any error (atomic import
 * only proceeds on a fully-clean file).
 */
export interface AssetImportValidationSummary {
  importId: string | null;
  totalRows: number;
  validCount: number;
  errorCount: number;
  /** File-level problems (unreadable/empty/missing columns/too many rows). */
  fileErrors: AssetImportRowError[];
  /** Per data-row preview with inline errors. */
  rows: AssetImportPreviewRow[];
}

/** Server-side staged payload kept in Redis between `/validate` and `/import`. */
export interface StagedAssetImport {
  tenantId: string;
  createdAt: string;
  rows: ValidatedAssetImportRow[];
}

/** Outcome of a successful atomic import (`POST /assets/import`). */
export interface AssetImportResult {
  created: number;
  assignmentsCreated: number;
}
