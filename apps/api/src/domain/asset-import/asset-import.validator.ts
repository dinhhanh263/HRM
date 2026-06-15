import {
  ASSET_IMPORT_COLUMNS,
  ASSET_IMPORT_ENUM_OPTIONS,
  ASSET_IMPORT_ERROR_CODES,
  type AssetCondition,
  type AssetImportColumn,
  type AssetImportRowError,
  type ParsedAssetImportRow,
} from '@hrm/shared';

// Pure, deterministic per-row + cross-row validation. NO database access here —
// DB-dependent checks (assetCode already exists, category-by-code, owner
// resolvable) live in the validate/import service. This is the riskiest logic so
// it is fully unit-tested. Each row yields its raw cell values (for the wizard
// preview table), the errors found, and — only when zero pure errors — a typed
// draft carrying the category CODE and owner REF for the service to resolve.

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
// Mirror the create-asset schema: uppercase letters, digits, hyphen, underscore.
const ASSET_CODE_REGEX = /^[A-Z0-9_-]+$/;
const ASSET_CODE_MAX = 50;
const NAME_MAX = 150;
const PURCHASE_COST_MAX = 1_000_000_000_000;
// Plain non-negative decimal only. Guards against Number() coercing "1e3",
// "0x10", or "Infinity" into a silently-wrong cost from a user typo.
const COST_REGEX = /^\d+(\.\d+)?$/;

const CONDITION_VALUES = new Set<string>(ASSET_IMPORT_ENUM_OPTIONS.condition);

/** True only for a real calendar date in strict `YYYY-MM-DD` form. */
function isValidIsoDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * A row that passed every PURE check. Holds the category CODE and owner REF
 * (email or employee code) rather than resolved ids — the service resolves those
 * against the DB. Optional blanks are normalized to null; condition/cost typed.
 */
export interface AssetRowDraft {
  rowNumber: number;
  assetCode: string;
  name: string;
  categoryCode: string;
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
  ownerRef: string | null;
  assignedAt: string | null;
}

/** Per-row outcome: raw values for preview, the errors, and a draft when clean. */
export interface AssetRowValidation {
  rowNumber: number;
  data: Record<AssetImportColumn, string>;
  errors: AssetImportRowError[];
  draft: AssetRowDraft | null;
}

function toDataRecord(row: ParsedAssetImportRow): Record<AssetImportColumn, string> {
  const data = {} as Record<AssetImportColumn, string>;
  for (const col of ASSET_IMPORT_COLUMNS) data[col] = row[col];
  return data;
}

/**
 * Validate parsed rows with pure logic only. Returns one entry per data row (in
 * order) so the caller can render a full preview; `draft` is non-null exactly
 * when the row has zero pure errors. Cross-row in-file assetCode duplicates are
 * flagged here (the second+ occurrence fails).
 */
export function validateAssetRows(rows: ParsedAssetImportRow[]): AssetRowValidation[] {
  const results: AssetRowValidation[] = [];
  // Track the first row each assetCode appeared on, to flag later duplicates.
  const codeFirstSeenRow = new Map<string, number>();

  for (const row of rows) {
    const errors: AssetImportRowError[] = [];

    const assetCode = row.assetCode.trim();
    const name = row.name.trim();
    const categoryCode = row.category.trim();

    // --- Required fields ---
    if (!assetCode) {
      errors.push(err(row.rowNumber, 'assetCode', 'MISSING_REQUIRED', 'Asset code is required'));
    } else if (assetCode.length > ASSET_CODE_MAX || !ASSET_CODE_REGEX.test(assetCode)) {
      errors.push(
        err(
          row.rowNumber,
          'assetCode',
          'INVALID_ASSET_CODE',
          `Invalid asset code (uppercase letters, digits, hyphen or underscore; max ${ASSET_CODE_MAX}): ${assetCode}`,
        ),
      );
    }
    if (!name) {
      errors.push(err(row.rowNumber, 'name', 'MISSING_REQUIRED', 'Asset name is required'));
    } else if (name.length > NAME_MAX) {
      errors.push(
        err(row.rowNumber, 'name', 'MISSING_REQUIRED', `Asset name is too long (max ${NAME_MAX})`),
      );
    }
    if (!categoryCode) {
      errors.push(err(row.rowNumber, 'category', 'MISSING_REQUIRED', 'Category code is required'));
    }

    // --- Optional enum: condition ---
    const condition = row.condition.trim().toUpperCase();
    if (condition && !CONDITION_VALUES.has(condition)) {
      errors.push(
        err(row.rowNumber, 'condition', 'INVALID_ENUM', `Invalid condition: ${row.condition.trim()}`),
      );
    }

    // --- Optional dates ---
    const purchaseDate = row.purchaseDate.trim();
    if (purchaseDate && !isValidIsoDate(purchaseDate)) {
      errors.push(
        err(row.rowNumber, 'purchaseDate', 'INVALID_DATE', `Invalid date (expected YYYY-MM-DD): ${purchaseDate}`),
      );
    }
    const warrantyEndDate = row.warrantyEndDate.trim();
    if (warrantyEndDate && !isValidIsoDate(warrantyEndDate)) {
      errors.push(
        err(row.rowNumber, 'warrantyEndDate', 'INVALID_DATE', `Invalid date (expected YYYY-MM-DD): ${warrantyEndDate}`),
      );
    }
    const assignedAt = row.assignedAt.trim();
    if (assignedAt && !isValidIsoDate(assignedAt)) {
      errors.push(
        err(row.rowNumber, 'assignedAt', 'INVALID_DATE', `Invalid date (expected YYYY-MM-DD): ${assignedAt}`),
      );
    }

    // --- Optional number: purchaseCost ---
    const costRaw = row.purchaseCost.trim();
    let purchaseCost: number | null = null;
    if (costRaw) {
      const n = Number(costRaw);
      if (!COST_REGEX.test(costRaw) || !Number.isFinite(n) || n > PURCHASE_COST_MAX) {
        errors.push(
          err(row.rowNumber, 'purchaseCost', 'INVALID_COST', `Invalid purchase cost (expected a number 0–${PURCHASE_COST_MAX}): ${costRaw}`),
        );
      } else {
        purchaseCost = n;
      }
    }

    // --- Owner ⇒ assignedAt required ---
    const ownerRef = row.owner.trim();
    if (ownerRef && !assignedAt) {
      errors.push(
        err(
          row.rowNumber,
          'assignedAt',
          'OWNER_MISSING_ASSIGNED_DATE',
          'Assigned date is required when an owner is set',
        ),
      );
    }

    // --- Cross-row: duplicate assetCode within the file ---
    if (assetCode) {
      const firstRow = codeFirstSeenRow.get(assetCode);
      if (firstRow === undefined) {
        codeFirstSeenRow.set(assetCode, row.rowNumber);
      } else {
        errors.push(
          err(
            row.rowNumber,
            'assetCode',
            'ASSET_CODE_DUPLICATE_IN_FILE',
            `Duplicate asset code in file (first seen at row ${firstRow}): ${assetCode}`,
          ),
        );
      }
    }

    const data = toDataRecord(row);
    if (errors.length > 0) {
      results.push({ rowNumber: row.rowNumber, data, errors, draft: null });
      continue;
    }

    results.push({
      rowNumber: row.rowNumber,
      data,
      errors: [],
      draft: {
        rowNumber: row.rowNumber,
        assetCode,
        name,
        categoryCode,
        serialNumber: row.serialNumber.trim() || null,
        brand: row.brand.trim() || null,
        model: row.model.trim() || null,
        condition: condition ? (condition as AssetCondition) : null,
        purchaseDate: purchaseDate || null,
        purchaseCost,
        warrantyEndDate: warrantyEndDate || null,
        vendor: row.vendor.trim() || null,
        location: row.location.trim() || null,
        note: row.note.trim() || null,
        ownerRef: ownerRef || null,
        assignedAt: assignedAt || null,
      },
    });
  }

  return results;
}

function err(
  row: number,
  column: AssetImportColumn,
  code: keyof typeof ASSET_IMPORT_ERROR_CODES,
  message: string,
): AssetImportRowError {
  return { row, column, code: ASSET_IMPORT_ERROR_CODES[code], message };
}
