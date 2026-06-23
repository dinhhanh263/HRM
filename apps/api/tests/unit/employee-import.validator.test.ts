import { describe, it, expect } from 'vitest';
import { IMPORT_ERROR_CODES, type ParsedImportRow } from '@hrm/shared';
import { validateRows } from '../../src/domain/employee-import/employee-import.validator.js';

/** Build a ParsedImportRow with sensible blank defaults, overriding fields. */
function makeRow(rowNumber: number, overrides: Partial<ParsedImportRow> = {}): ParsedImportRow {
  return {
    rowNumber,
    employeeCode: `NV-${rowNumber}`,
    fullName: 'Nguyen Van A',
    email: `user${rowNumber}@example.com`,
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
    ...overrides,
  };
}

/** Collect the codes present for a given 1-based row. */
function codesForRow(errors: { row: number; code: string }[], row: number): string[] {
  return errors.filter((e) => e.row === row).map((e) => e.code);
}

describe('employee-import validator — per-row codes', () => {
  it('accepts a clean row and applies enum defaults + null normalization', () => {
    const { valid, errors } = validateRows([makeRow(1)]);

    expect(errors).toHaveLength(0);
    expect(valid).toHaveLength(1);
    expect(valid[0]).toMatchObject({
      rowNumber: 1,
      email: 'user1@example.com',
      contractType: 'FULL_TIME', // default
      role: 'EMPLOYEE', // default
      dateOfBirth: null,
      gender: null,
      department: null,
    });
  });

  it('lowercases email and trims whitespace on a clean row', () => {
    const { valid } = validateRows([
      makeRow(1, { email: '  MixedCase@Example.COM ', fullName: '  Tran Thi B  ' }),
    ]);
    expect(valid[0].email).toBe('mixedcase@example.com');
    expect(valid[0].fullName).toBe('Tran Thi B');
  });

  it('flags IMPORT_MISSING_REQUIRED for empty fullName and email', () => {
    const { valid, errors } = validateRows([makeRow(1, { fullName: '   ', email: '' })]);
    expect(valid).toHaveLength(0);
    const codes = codesForRow(errors, 1);
    expect(codes.filter((c) => c === IMPORT_ERROR_CODES.MISSING_REQUIRED)).toHaveLength(2);
  });

  it('flags IMPORT_MISSING_REQUIRED for an empty employeeCode', () => {
    const { valid, errors } = validateRows([makeRow(1, { employeeCode: '   ' })]);
    expect(valid).toHaveLength(0);
    const codeErr = errors.find(
      (e) => e.row === 1 && e.column === 'employeeCode',
    );
    expect(codeErr?.code).toBe(IMPORT_ERROR_CODES.MISSING_REQUIRED);
  });

  it('flags IMPORT_EMPLOYEE_CODE_DUPLICATE_IN_FILE on the second occurrence only', () => {
    const { valid, errors } = validateRows([
      makeRow(1, { employeeCode: 'NV-DUP' }),
      makeRow(2, { employeeCode: 'NV-DUP' }),
    ]);
    expect(valid).toHaveLength(1); // only the first survives
    expect(codesForRow(errors, 1)).not.toContain(
      IMPORT_ERROR_CODES.EMPLOYEE_CODE_DUPLICATE_IN_FILE,
    );
    expect(codesForRow(errors, 2)).toContain(
      IMPORT_ERROR_CODES.EMPLOYEE_CODE_DUPLICATE_IN_FILE,
    );
  });

  it('flags IMPORT_INVALID_EMAIL for a malformed email', () => {
    const { errors } = validateRows([makeRow(1, { email: 'not-an-email' })]);
    expect(codesForRow(errors, 1)).toContain(IMPORT_ERROR_CODES.INVALID_EMAIL);
  });

  it('flags IMPORT_INVALID_DATE for bad dateOfBirth and joinDate', () => {
    const { errors } = validateRows([
      makeRow(1, { dateOfBirth: '31/12/1990' }),
      makeRow(2, { joinDate: '2026-13-40' }),
    ]);
    expect(codesForRow(errors, 1)).toContain(IMPORT_ERROR_CODES.INVALID_DATE);
    expect(codesForRow(errors, 2)).toContain(IMPORT_ERROR_CODES.INVALID_DATE);
  });

  it('accepts a valid YYYY-MM-DD date', () => {
    const { valid, errors } = validateRows([makeRow(1, { dateOfBirth: '1990-12-31' })]);
    expect(errors).toHaveLength(0);
    expect(valid[0].dateOfBirth).toBe('1990-12-31');
  });

  it('flags IMPORT_INVALID_ENUM for bad gender, contractType, and role', () => {
    const { errors } = validateRows([
      makeRow(1, { gender: 'X' }),
      makeRow(2, { contractType: 'FREELANCE' }),
      makeRow(3, { role: 'CEO' }),
    ]);
    expect(codesForRow(errors, 1)).toContain(IMPORT_ERROR_CODES.INVALID_ENUM);
    expect(codesForRow(errors, 2)).toContain(IMPORT_ERROR_CODES.INVALID_ENUM);
    expect(codesForRow(errors, 3)).toContain(IMPORT_ERROR_CODES.INVALID_ENUM);
  });

  it('accepts case-insensitive enum values and applies them', () => {
    const { valid, errors } = validateRows([
      makeRow(1, { gender: 'male', contractType: 'part_time', role: 'manager' }),
    ]);
    expect(errors).toHaveLength(0);
    expect(valid[0]).toMatchObject({ gender: 'MALE', contractType: 'PART_TIME', role: 'MANAGER' });
  });

  it('flags IMPORT_EMAIL_DUPLICATE_IN_FILE on the second occurrence only', () => {
    const { valid, errors } = validateRows([
      makeRow(1, { email: 'dup@example.com' }),
      makeRow(2, { email: 'DUP@example.com' }), // same after lowercasing
    ]);
    // First occurrence is valid; second is rejected as duplicate.
    expect(valid.map((v) => v.rowNumber)).toEqual([1]);
    expect(codesForRow(errors, 1)).not.toContain(IMPORT_ERROR_CODES.EMAIL_DUPLICATE_IN_FILE);
    expect(codesForRow(errors, 2)).toContain(IMPORT_ERROR_CODES.EMAIL_DUPLICATE_IN_FILE);
  });

  it('does not run duplicate check against an invalid email', () => {
    const { errors } = validateRows([
      makeRow(1, { email: 'bad' }),
      makeRow(2, { email: 'bad' }),
    ]);
    // Both flagged INVALID_EMAIL, neither flagged as in-file duplicate.
    expect(errors.some((e) => e.code === IMPORT_ERROR_CODES.EMAIL_DUPLICATE_IN_FILE)).toBe(false);
  });

  describe('dependentsCount (PIT dependent deduction)', () => {
    it('defaults a blank dependentsCount to 0', () => {
      const { valid, errors } = validateRows([makeRow(1, { dependentsCount: '' })]);
      expect(errors).toHaveLength(0);
      expect(valid[0].dependentsCount).toBe(0);
    });

    it('parses a valid integer dependentsCount', () => {
      const { valid, errors } = validateRows([makeRow(1, { dependentsCount: '3' })]);
      expect(errors).toHaveLength(0);
      expect(valid[0].dependentsCount).toBe(3);
    });

    it('flags IMPORT_INVALID_NUMBER for a negative value', () => {
      const { valid, errors } = validateRows([makeRow(1, { dependentsCount: '-1' })]);
      expect(valid).toHaveLength(0);
      expect(codesForRow(errors, 1)).toContain(IMPORT_ERROR_CODES.INVALID_NUMBER);
    });

    it('flags IMPORT_INVALID_NUMBER for a value above 20', () => {
      const { errors } = validateRows([makeRow(1, { dependentsCount: '21' })]);
      expect(codesForRow(errors, 1)).toContain(IMPORT_ERROR_CODES.INVALID_NUMBER);
    });

    it('flags IMPORT_INVALID_NUMBER for a non-integer value', () => {
      const { errors } = validateRows([makeRow(1, { dependentsCount: '2.5' })]);
      expect(codesForRow(errors, 1)).toContain(IMPORT_ERROR_CODES.INVALID_NUMBER);
    });
  });

  // SPEC-040 extended profile fields.
  describe('extended profile fields', () => {
    it('normalizes a clean row with extended fields (enum uppercased, blanks → null)', () => {
      const { valid, errors } = validateRows([
        makeRow(1, {
          placeOfBirth: 'Hà Nội',
          idIssueDate: '2018-05-20',
          personalEmail: 'Personal@Email.com',
          maritalStatus: 'married',
          bankName: 'Vietcombank',
        }),
      ]);
      expect(errors).toHaveLength(0);
      expect(valid[0]).toMatchObject({
        placeOfBirth: 'Hà Nội',
        idIssueDate: '2018-05-20',
        personalEmail: 'personal@email.com', // lowercased
        maritalStatus: 'MARRIED', // uppercased enum
        bankName: 'Vietcombank',
        currentAddress: null, // blank → null
      });
    });

    it('flags IMPORT_INVALID_ENUM for an unknown maritalStatus', () => {
      const { valid, errors } = validateRows([makeRow(1, { maritalStatus: 'COMPLICATED' })]);
      expect(valid).toHaveLength(0);
      expect(codesForRow(errors, 1)).toContain(IMPORT_ERROR_CODES.INVALID_ENUM);
    });

    it('flags IMPORT_INVALID_EMAIL for a malformed personal email', () => {
      const { valid, errors } = validateRows([makeRow(1, { personalEmail: 'not-an-email' })]);
      expect(valid).toHaveLength(0);
      expect(codesForRow(errors, 1)).toContain(IMPORT_ERROR_CODES.INVALID_EMAIL);
    });

    it('flags IMPORT_INVALID_DATE for a malformed idIssueDate', () => {
      const { valid, errors } = validateRows([makeRow(1, { idIssueDate: '20-05-2018' })]);
      expect(valid).toHaveLength(0);
      expect(codesForRow(errors, 1)).toContain(IMPORT_ERROR_CODES.INVALID_DATE);
    });
  });
});
