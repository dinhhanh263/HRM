import { describe, it, expect } from 'vitest';
import {
  PR_ITEM_IMPORT_ERROR_CODES,
  PR_ITEM_IMPORT_DEFAULT_TAX_RATE,
  type ParsedPRItemRow,
} from '@hrm/shared';
import {
  validatePRItemRows,
  type PRItemRowValidation,
} from '../../src/domain/purchase-request-import/purchase-request-import.validator.js';

/** Build a ParsedPRItemRow with a clean minimal default, overriding given fields. */
function makeRow(rowNumber: number, overrides: Partial<ParsedPRItemRow> = {}): ParsedPRItemRow {
  return {
    rowNumber,
    productName: 'Laptop Dell',
    sku: '',
    unit: '',
    quantity: '2',
    unitPrice: '1000000',
    taxRate: '',
    ...overrides,
  };
}

function codes(result: PRItemRowValidation): string[] {
  return result.errors.map((e) => e.code);
}

describe('purchase-request-import validator — per-row', () => {
  it('accepts a clean minimal row and returns a typed item', () => {
    const [r] = validatePRItemRows([makeRow(1)]);
    expect(r.errors).toHaveLength(0);
    expect(r.item).toEqual({
      sku: undefined,
      productName: 'Laptop Dell',
      unit: undefined,
      quantity: 2,
      unitPrice: 1_000_000,
      taxRate: PR_ITEM_IMPORT_DEFAULT_TAX_RATE,
    });
  });

  it('defaults a blank taxRate to 8', () => {
    const [r] = validatePRItemRows([makeRow(1, { taxRate: '' })]);
    expect(r.item?.taxRate).toBe(8);
  });

  it('keeps an explicit taxRate of 0', () => {
    const [r] = validatePRItemRows([makeRow(1, { taxRate: '0' })]);
    expect(r.errors).toHaveLength(0);
    expect(r.item?.taxRate).toBe(0);
  });

  it('flags a missing productName', () => {
    const [r] = validatePRItemRows([makeRow(1, { productName: '  ' })]);
    expect(codes(r)).toContain(PR_ITEM_IMPORT_ERROR_CODES.MISSING_REQUIRED);
    expect(r.item).toBeNull();
  });

  it('flags a missing quantity and a missing unitPrice', () => {
    const [r] = validatePRItemRows([makeRow(1, { quantity: '', unitPrice: '' })]);
    expect(codes(r).filter((c) => c === PR_ITEM_IMPORT_ERROR_CODES.MISSING_REQUIRED)).toHaveLength(2);
  });

  it('rejects a non-positive quantity', () => {
    const [zero] = validatePRItemRows([makeRow(1, { quantity: '0' })]);
    expect(codes(zero)).toContain(PR_ITEM_IMPORT_ERROR_CODES.QUANTITY_NOT_POSITIVE);
  });

  it('rejects a negative unit price as an invalid number', () => {
    // A leading minus fails the non-negative decimal regex.
    const [r] = validatePRItemRows([makeRow(1, { unitPrice: '-5' })]);
    expect(codes(r)).toContain(PR_ITEM_IMPORT_ERROR_CODES.INVALID_NUMBER);
    expect(r.item).toBeNull();
  });

  it('rejects a garbage number (1e3 / letters)', () => {
    const [sci] = validatePRItemRows([makeRow(1, { quantity: '1e3' })]);
    expect(codes(sci)).toContain(PR_ITEM_IMPORT_ERROR_CODES.INVALID_NUMBER);
    const [txt] = validatePRItemRows([makeRow(2, { unitPrice: 'abc' })]);
    expect(codes(txt)).toContain(PR_ITEM_IMPORT_ERROR_CODES.INVALID_NUMBER);
  });

  it('rejects a taxRate outside 0–100', () => {
    const [r] = validatePRItemRows([makeRow(1, { taxRate: '150' })]);
    expect(codes(r)).toContain(PR_ITEM_IMPORT_ERROR_CODES.TAX_RATE_RANGE);
  });

  it('strips thousands separators in unit price', () => {
    const [r] = validatePRItemRows([makeRow(1, { unitPrice: '1,200,000' })]);
    expect(r.errors).toHaveLength(0);
    expect(r.item?.unitPrice).toBe(1_200_000);
  });

  it('accepts a fractional quantity', () => {
    const [r] = validatePRItemRows([makeRow(1, { quantity: '1.5' })]);
    expect(r.errors).toHaveLength(0);
    expect(r.item?.quantity).toBe(1.5);
  });

  it('returns valid rows even when other rows fail (partial import)', () => {
    const results = validatePRItemRows([
      makeRow(1),
      makeRow(2, { quantity: '0' }),
      makeRow(3, { productName: 'Mouse', unitPrice: '350000' }),
    ]);
    const items = results.flatMap((r) => (r.item ? [r.item] : []));
    expect(items).toHaveLength(2);
    expect(results[1].item).toBeNull();
  });

  it('trims optional sku/unit and preserves them', () => {
    const [r] = validatePRItemRows([makeRow(1, { sku: '  DELL-1  ', unit: ' cái ' })]);
    expect(r.item?.sku).toBe('DELL-1');
    expect(r.item?.unit).toBe('cái');
  });
});
