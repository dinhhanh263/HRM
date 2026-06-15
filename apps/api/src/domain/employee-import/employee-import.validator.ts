import {
  ContractType,
  Gender,
  IMPORT_ERROR_CODES,
  type ImportRowError,
  type ParsedImportRow,
  type ValidatedImportRow,
} from '@hrm/shared';

// Pure, deterministic per-row + cross-row validation. NO database access here
// — DB-dependent checks (email exists, manager resolvable, cycle) live in the
// validate/import service. This is the riskiest logic so it is fully unit-tested.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const GENDER_VALUES = new Set<string>(Object.values(Gender));
const CONTRACT_VALUES = new Set<string>(Object.values(ContractType));
const ROLE_VALUES = new Set<string>(['EMPLOYEE', 'MANAGER', 'HR_MANAGER']);

const DEFAULT_CONTRACT: ContractType = ContractType.FULL_TIME;
const DEFAULT_ROLE: ValidatedImportRow['role'] = 'EMPLOYEE';

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

export interface ValidationResult {
  valid: ValidatedImportRow[];
  errors: ImportRowError[];
}

/**
 * Validate parsed rows. Returns the subset that passed every check (typed
 * enums applied, optional blanks normalized to null) plus a flat list of
 * stable-coded errors. A row appears in `valid` only if it has zero errors,
 * including the cross-row in-file email duplicate check.
 */
export function validateRows(rows: ParsedImportRow[]): ValidationResult {
  const errors: ImportRowError[] = [];
  const valid: ValidatedImportRow[] = [];

  // Track the first row each email appeared on, to flag later duplicates.
  const emailFirstSeenRow = new Map<string, number>();

  for (const row of rows) {
    const rowErrors: ImportRowError[] = [];

    const fullName = row.fullName.trim();
    const email = row.email.trim().toLowerCase();

    // --- Required fields ---
    if (!fullName) {
      rowErrors.push({
        row: row.rowNumber,
        column: 'fullName',
        code: IMPORT_ERROR_CODES.MISSING_REQUIRED,
        message: 'fullName is required',
      });
    }
    if (!email) {
      rowErrors.push({
        row: row.rowNumber,
        column: 'email',
        code: IMPORT_ERROR_CODES.MISSING_REQUIRED,
        message: 'email is required',
      });
    } else if (!EMAIL_REGEX.test(email)) {
      rowErrors.push({
        row: row.rowNumber,
        column: 'email',
        code: IMPORT_ERROR_CODES.INVALID_EMAIL,
        message: `Invalid email format: ${email}`,
      });
    }

    // --- Optional dates ---
    const dateOfBirth = row.dateOfBirth.trim();
    if (dateOfBirth && !isValidIsoDate(dateOfBirth)) {
      rowErrors.push({
        row: row.rowNumber,
        column: 'dateOfBirth',
        code: IMPORT_ERROR_CODES.INVALID_DATE,
        message: `Invalid date (expected YYYY-MM-DD): ${dateOfBirth}`,
      });
    }
    const joinDate = row.joinDate.trim();
    if (joinDate && !isValidIsoDate(joinDate)) {
      rowErrors.push({
        row: row.rowNumber,
        column: 'joinDate',
        code: IMPORT_ERROR_CODES.INVALID_DATE,
        message: `Invalid date (expected YYYY-MM-DD): ${joinDate}`,
      });
    }

    // --- Optional enums ---
    const gender = row.gender.trim().toUpperCase();
    if (gender && !GENDER_VALUES.has(gender)) {
      rowErrors.push({
        row: row.rowNumber,
        column: 'gender',
        code: IMPORT_ERROR_CODES.INVALID_ENUM,
        message: `Invalid gender: ${row.gender}`,
      });
    }
    const contractType = row.contractType.trim().toUpperCase();
    if (contractType && !CONTRACT_VALUES.has(contractType)) {
      rowErrors.push({
        row: row.rowNumber,
        column: 'contractType',
        code: IMPORT_ERROR_CODES.INVALID_ENUM,
        message: `Invalid contractType: ${row.contractType}`,
      });
    }
    const role = row.role.trim().toUpperCase();
    if (role && !ROLE_VALUES.has(role)) {
      rowErrors.push({
        row: row.rowNumber,
        column: 'role',
        code: IMPORT_ERROR_CODES.INVALID_ENUM,
        message: `Invalid role: ${row.role}`,
      });
    }

    // --- Optional number: dependentsCount (blank → 0) ---
    // Drives the PIT dependent deduction. A blank cell means "no dependents",
    // not an error; only a non-integer or out-of-range value fails the row.
    const dependentsRaw = row.dependentsCount.trim();
    let dependentsCount = 0;
    if (dependentsRaw) {
      const n = Number(dependentsRaw);
      if (!Number.isInteger(n) || n < 0 || n > 20) {
        rowErrors.push({
          row: row.rowNumber,
          column: 'dependentsCount',
          code: IMPORT_ERROR_CODES.INVALID_NUMBER,
          message: `Invalid dependentsCount (expected an integer 0–20): ${row.dependentsCount}`,
        });
      } else {
        dependentsCount = n;
      }
    }

    // --- Cross-row: duplicate email within the file ---
    if (email && EMAIL_REGEX.test(email)) {
      const firstRow = emailFirstSeenRow.get(email);
      if (firstRow === undefined) {
        emailFirstSeenRow.set(email, row.rowNumber);
      } else {
        rowErrors.push({
          row: row.rowNumber,
          column: 'email',
          code: IMPORT_ERROR_CODES.EMAIL_DUPLICATE_IN_FILE,
          message: `Duplicate email in file (first seen at row ${firstRow}): ${email}`,
        });
      }
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    // Row is clean — normalize into a typed, defaulted record.
    valid.push({
      rowNumber: row.rowNumber,
      fullName,
      email,
      dateOfBirth: dateOfBirth || null,
      gender: gender ? (gender as Gender) : null,
      idNumber: row.idNumber.trim() || null,
      phone: row.phone.trim() || null,
      department: row.department.trim() || null,
      position: row.position.trim() || null,
      manager: row.manager.trim() || null,
      joinDate: joinDate || null,
      contractType: contractType ? (contractType as ContractType) : DEFAULT_CONTRACT,
      dependentsCount,
      role: role ? (role as ValidatedImportRow['role']) : DEFAULT_ROLE,
    });
  }

  return { valid, errors };
}
