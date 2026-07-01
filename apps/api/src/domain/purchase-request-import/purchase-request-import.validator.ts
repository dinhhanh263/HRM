import {
  PR_ITEM_IMPORT_COLUMNS,
  PR_ITEM_IMPORT_DEFAULT_TAX_RATE,
  PR_ITEM_IMPORT_ERROR_CODES,
  type PRItemImportColumn,
  type PRItemImportRowError,
  type ParsedPRItemRow,
  type ValidatedPRItemRow,
} from '@hrm/shared';

// Pure, deterministic per-row validation. NO database access — this import is
// stateless and never persists, so there are no DB-dependent checks at all. This
// mirrors the create-request item schema (purchase-request.validator.ts) so a
// row that validates here will also pass the eventual POST /purchase-requests.
// It is fully unit-tested.

const PRODUCT_NAME_MAX = 300;
const SKU_MAX = 100;
const UNIT_MAX = 50;
// Mirror quantitySchema / unitPriceSchema in purchase-request.validator.ts.
const QUANTITY_MAX = 99_999_999.999;
const UNIT_PRICE_MAX = 999_999_999_999.99;
const TAX_RATE_MIN = 0;
const TAX_RATE_MAX = 100;

// Plain non-negative decimal only (optional thousands separators stripped before
// this test). Guards against Number() coercing "1e3", "0x10", "Infinity" or a
// stray letter into a silently-wrong value from a user typo.
const NUMBER_REGEX = /^\d+(\.\d+)?$/;

/** Per-row outcome: raw values for preview, the errors, and an item when clean. */
export interface PRItemRowValidation {
  rowNumber: number;
  data: Record<PRItemImportColumn, string>;
  errors: PRItemImportRowError[];
  item: ValidatedPRItemRow | null;
}

function toDataRecord(row: ParsedPRItemRow): Record<PRItemImportColumn, string> {
  const data = {} as Record<PRItemImportColumn, string>;
  for (const col of PR_ITEM_IMPORT_COLUMNS) data[col] = row[col];
  return data;
}

function err(
  row: number,
  column: PRItemImportColumn,
  code: keyof typeof PR_ITEM_IMPORT_ERROR_CODES,
  message: string,
): PRItemImportRowError {
  return { row, column, code: PR_ITEM_IMPORT_ERROR_CODES[code], message };
}

/** Strip spaces and thousands separators so "1,200,000" and "1 200 000" parse. */
function stripSeparators(value: string): string {
  return value.replace(/[\s,]/g, '');
}

/**
 * Validate parsed rows with pure logic only. Returns one entry per data row (in
 * order) so the caller can render a full preview; `item` is non-null exactly
 * when the row has zero errors and is ready to merge into the form.
 */
export function validatePRItemRows(rows: ParsedPRItemRow[]): PRItemRowValidation[] {
  return rows.map((row) => {
    const errors: PRItemImportRowError[] = [];

    // --- productName (required) ---
    const productName = row.productName.trim();
    if (!productName) {
      errors.push(err(row.rowNumber, 'productName', 'MISSING_REQUIRED', 'Product name is required'));
    } else if (productName.length > PRODUCT_NAME_MAX) {
      errors.push(
        err(row.rowNumber, 'productName', 'TOO_LONG', `Product name is too long (max ${PRODUCT_NAME_MAX})`),
      );
    }

    // --- sku / unit (optional, length only) ---
    const sku = row.sku.trim();
    if (sku.length > SKU_MAX) {
      errors.push(err(row.rowNumber, 'sku', 'TOO_LONG', `SKU is too long (max ${SKU_MAX})`));
    }
    const unit = row.unit.trim();
    if (unit.length > UNIT_MAX) {
      errors.push(err(row.rowNumber, 'unit', 'TOO_LONG', `Unit is too long (max ${UNIT_MAX})`));
    }

    // --- quantity (required, > 0) ---
    const quantityRaw = stripSeparators(row.quantity.trim());
    let quantity: number | null = null;
    if (!quantityRaw) {
      errors.push(err(row.rowNumber, 'quantity', 'MISSING_REQUIRED', 'Quantity is required'));
    } else if (!NUMBER_REGEX.test(quantityRaw) || !Number.isFinite(Number(quantityRaw))) {
      errors.push(err(row.rowNumber, 'quantity', 'INVALID_NUMBER', `Invalid quantity: ${row.quantity.trim()}`));
    } else {
      const n = Number(quantityRaw);
      if (n <= 0) {
        errors.push(err(row.rowNumber, 'quantity', 'QUANTITY_NOT_POSITIVE', 'Quantity must be greater than 0'));
      } else if (n > QUANTITY_MAX) {
        errors.push(err(row.rowNumber, 'quantity', 'INVALID_NUMBER', `Quantity exceeds the limit (max ${QUANTITY_MAX})`));
      } else {
        quantity = n;
      }
    }

    // --- unitPrice (required, >= 0) ---
    const unitPriceRaw = stripSeparators(row.unitPrice.trim());
    let unitPrice: number | null = null;
    if (!unitPriceRaw) {
      errors.push(err(row.rowNumber, 'unitPrice', 'MISSING_REQUIRED', 'Unit price is required'));
    } else if (!NUMBER_REGEX.test(unitPriceRaw) || !Number.isFinite(Number(unitPriceRaw))) {
      errors.push(err(row.rowNumber, 'unitPrice', 'INVALID_NUMBER', `Invalid unit price: ${row.unitPrice.trim()}`));
    } else {
      const n = Number(unitPriceRaw);
      if (n > UNIT_PRICE_MAX) {
        errors.push(err(row.rowNumber, 'unitPrice', 'INVALID_NUMBER', `Unit price exceeds the limit (max ${UNIT_PRICE_MAX})`));
      } else {
        unitPrice = n; // >= 0 guaranteed by NUMBER_REGEX (no leading minus)
      }
    }

    // --- taxRate (optional, 0–100; blank ⇒ default) ---
    const taxRateRaw = stripSeparators(row.taxRate.trim());
    let taxRate: number = PR_ITEM_IMPORT_DEFAULT_TAX_RATE;
    if (taxRateRaw) {
      if (!NUMBER_REGEX.test(taxRateRaw) || !Number.isFinite(Number(taxRateRaw))) {
        errors.push(err(row.rowNumber, 'taxRate', 'INVALID_NUMBER', `Invalid tax rate: ${row.taxRate.trim()}`));
      } else {
        const n = Number(taxRateRaw);
        if (n < TAX_RATE_MIN || n > TAX_RATE_MAX) {
          errors.push(err(row.rowNumber, 'taxRate', 'TAX_RATE_RANGE', `Tax rate must be between ${TAX_RATE_MIN} and ${TAX_RATE_MAX}`));
        } else {
          taxRate = n;
        }
      }
    }

    const data = toDataRecord(row);
    if (errors.length > 0 || quantity === null || unitPrice === null) {
      return { rowNumber: row.rowNumber, data, errors, item: null };
    }

    return {
      rowNumber: row.rowNumber,
      data,
      errors: [],
      item: {
        sku: sku || undefined,
        productName,
        unit: unit || undefined,
        quantity,
        unitPrice,
        taxRate,
      },
    };
  });
}
