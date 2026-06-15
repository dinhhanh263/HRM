import { describe, it, expect } from 'vitest';
import { ASSET_IMPORT_ERROR_CODES, type ParsedAssetImportRow } from '@hrm/shared';
import {
  validateAssetRows,
  type AssetRowValidation,
} from '../../src/domain/asset-import/asset-import.validator.js';

/** Build a ParsedAssetImportRow with blank defaults, overriding given fields.
 *  Mirrors the parser's output: assetCode arrives already uppercased. */
function makeRow(rowNumber: number, overrides: Partial<ParsedAssetImportRow> = {}): ParsedAssetImportRow {
  return {
    rowNumber,
    assetCode: `LAPTOP-${rowNumber}`,
    name: 'MacBook Pro',
    category: 'IT',
    serialNumber: '',
    brand: '',
    model: '',
    condition: '',
    purchaseDate: '',
    purchaseCost: '',
    warrantyEndDate: '',
    vendor: '',
    location: '',
    note: '',
    owner: '',
    assignedAt: '',
    ...overrides,
  };
}

function codesForRow(result: AssetRowValidation): string[] {
  return result.errors.map((e) => e.code);
}

describe('asset-import validator — per-row codes', () => {
  it('accepts a clean minimal row and emits a typed draft', () => {
    const [r] = validateAssetRows([makeRow(1)]);
    expect(r.errors).toHaveLength(0);
    expect(r.draft).not.toBeNull();
    expect(r.draft).toMatchObject({
      rowNumber: 1,
      assetCode: 'LAPTOP-1',
      name: 'MacBook Pro',
      categoryCode: 'IT',
      condition: null,
      purchaseCost: null,
      ownerRef: null,
      assignedAt: null,
    });
  });

  it('normalizes a full clean row (typed condition + numeric cost + nulls)', () => {
    const [r] = validateAssetRows([
      makeRow(1, {
        condition: 'good',
        purchaseDate: '2024-01-06',
        purchaseCost: '45000000',
        warrantyEndDate: '2027-01-06',
        brand: ' Apple ',
        serialNumber: '',
      }),
    ]);
    expect(r.errors).toHaveLength(0);
    expect(r.draft).toMatchObject({
      condition: 'GOOD',
      purchaseDate: '2024-01-06',
      purchaseCost: 45000000,
      warrantyEndDate: '2027-01-06',
      brand: 'Apple',
      serialNumber: null,
    });
  });

  it('flags MISSING_REQUIRED for blank assetCode / name / category', () => {
    const [r] = validateAssetRows([makeRow(1, { assetCode: '  ', name: '', category: '   ' })]);
    expect(r.draft).toBeNull();
    expect(codesForRow(r).filter((c) => c === ASSET_IMPORT_ERROR_CODES.MISSING_REQUIRED)).toHaveLength(3);
  });

  it('flags INVALID_ASSET_CODE for lowercase / illegal characters', () => {
    const [r] = validateAssetRows([makeRow(1, { assetCode: 'laptop 001!' })]);
    expect(codesForRow(r)).toContain(ASSET_IMPORT_ERROR_CODES.INVALID_ASSET_CODE);
  });

  it('flags INVALID_ENUM for an unknown condition', () => {
    const [r] = validateAssetRows([makeRow(1, { condition: 'EXCELLENT' })]);
    expect(codesForRow(r)).toContain(ASSET_IMPORT_ERROR_CODES.INVALID_ENUM);
  });

  it('flags INVALID_DATE for a malformed or impossible date', () => {
    const [a] = validateAssetRows([makeRow(1, { purchaseDate: '06/01/2024' })]);
    expect(codesForRow(a)).toContain(ASSET_IMPORT_ERROR_CODES.INVALID_DATE);
    const [b] = validateAssetRows([makeRow(2, { warrantyEndDate: '2024-02-31' })]);
    expect(codesForRow(b)).toContain(ASSET_IMPORT_ERROR_CODES.INVALID_DATE);
  });

  it('flags INVALID_COST for non-numeric or negative purchase cost', () => {
    const [a] = validateAssetRows([makeRow(1, { purchaseCost: '45,000,000' })]);
    expect(codesForRow(a)).toContain(ASSET_IMPORT_ERROR_CODES.INVALID_COST);
    const [b] = validateAssetRows([makeRow(2, { purchaseCost: '-100' })]);
    expect(codesForRow(b)).toContain(ASSET_IMPORT_ERROR_CODES.INVALID_COST);
  });

  it('rejects Number()-coercible non-decimals (scientific/hex) for purchase cost', () => {
    for (const bad of ['1e3', '0x10', 'Infinity', '1,000']) {
      const [r] = validateAssetRows([makeRow(1, { purchaseCost: bad })]);
      expect(codesForRow(r), `"${bad}" should be rejected`).toContain(
        ASSET_IMPORT_ERROR_CODES.INVALID_COST,
      );
    }
    // Plain decimals still pass and are typed as numbers.
    const [ok] = validateAssetRows([makeRow(1, { purchaseCost: '1500000.50' })]);
    expect(codesForRow(ok)).toHaveLength(0);
    expect(ok.draft?.purchaseCost).toBe(1500000.5);
  });

  it('requires assignedAt when an owner is set (OWNER_MISSING_ASSIGNED_DATE)', () => {
    const [r] = validateAssetRows([makeRow(1, { owner: 'an.nguyen@example.com', assignedAt: '' })]);
    expect(codesForRow(r)).toContain(ASSET_IMPORT_ERROR_CODES.OWNER_MISSING_ASSIGNED_DATE);
    expect(r.draft).toBeNull();
  });

  it('accepts an owner with a valid assignedAt and carries ownerRef untouched', () => {
    const [r] = validateAssetRows([
      makeRow(1, { owner: 'EMP001', assignedAt: '2024-03-01' }),
    ]);
    expect(r.errors).toHaveLength(0);
    expect(r.draft?.ownerRef).toBe('EMP001');
    expect(r.draft?.assignedAt).toBe('2024-03-01');
  });

  it('flags the second occurrence of a duplicate assetCode in the file', () => {
    const results = validateAssetRows([
      makeRow(1, { assetCode: 'DUP-1' }),
      makeRow(2, { assetCode: 'DUP-1' }),
    ]);
    expect(results[0].errors).toHaveLength(0);
    expect(results[1].errors.map((e) => e.code)).toContain(
      ASSET_IMPORT_ERROR_CODES.ASSET_CODE_DUPLICATE_IN_FILE,
    );
  });

  it('returns one preview entry per data row, in order, with raw cell values', () => {
    const results = validateAssetRows([makeRow(1), makeRow(2, { condition: 'NOPE' })]);
    expect(results).toHaveLength(2);
    expect(results[0].rowNumber).toBe(1);
    expect(results[1].data.condition).toBe('NOPE');
  });
});
