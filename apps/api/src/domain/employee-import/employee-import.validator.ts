import {
  ContractType,
  Gender,
  MaritalStatus,
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
const MARITAL_VALUES = new Set<string>(Object.values(MaritalStatus));
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

  // Track the first row each email / employee code appeared on, to flag later
  // duplicates within the same file.
  const emailFirstSeenRow = new Map<string, number>();
  const employeeCodeFirstSeenRow = new Map<string, number>();

  for (const row of rows) {
    const rowErrors: ImportRowError[] = [];

    const employeeCode = row.employeeCode.trim();
    const fullName = row.fullName.trim();
    const email = row.email.trim().toLowerCase();

    // --- Required fields ---
    if (!employeeCode) {
      rowErrors.push({
        row: row.rowNumber,
        column: 'employeeCode',
        code: IMPORT_ERROR_CODES.MISSING_REQUIRED,
        message: 'employeeCode is required',
      });
    }
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

    // --- Extended profile fields (SPEC-040) ---
    // Optional id-issue date: same strict YYYY-MM-DD rule as the other dates.
    const idIssueDate = row.idIssueDate.trim();
    if (idIssueDate && !isValidIsoDate(idIssueDate)) {
      rowErrors.push({
        row: row.rowNumber,
        column: 'idIssueDate',
        code: IMPORT_ERROR_CODES.INVALID_DATE,
        message: `Invalid date (expected YYYY-MM-DD): ${idIssueDate}`,
      });
    }
    // Optional personal email: validated only when present (it is not the login
    // email, so it need not be unique).
    const personalEmail = row.personalEmail.trim().toLowerCase();
    if (personalEmail && !EMAIL_REGEX.test(personalEmail)) {
      rowErrors.push({
        row: row.rowNumber,
        column: 'personalEmail',
        code: IMPORT_ERROR_CODES.INVALID_EMAIL,
        message: `Invalid personal email format: ${personalEmail}`,
      });
    }
    // Optional marital-status enum.
    const maritalStatus = row.maritalStatus.trim().toUpperCase();
    if (maritalStatus && !MARITAL_VALUES.has(maritalStatus)) {
      rowErrors.push({
        row: row.rowNumber,
        column: 'maritalStatus',
        code: IMPORT_ERROR_CODES.INVALID_ENUM,
        message: `Invalid maritalStatus: ${row.maritalStatus}`,
      });
    }

    // --- Cross-row: duplicate employee code within the file ---
    if (employeeCode) {
      const firstRow = employeeCodeFirstSeenRow.get(employeeCode);
      if (firstRow === undefined) {
        employeeCodeFirstSeenRow.set(employeeCode, row.rowNumber);
      } else {
        rowErrors.push({
          row: row.rowNumber,
          column: 'employeeCode',
          code: IMPORT_ERROR_CODES.EMPLOYEE_CODE_DUPLICATE_IN_FILE,
          message: `Duplicate employee code in file (first seen at row ${firstRow}): ${employeeCode}`,
        });
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
      employeeCode,
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
      placeOfBirth: row.placeOfBirth.trim() || null,
      idIssueDate: idIssueDate || null,
      idIssuePlace: row.idIssuePlace.trim() || null,
      personalEmail: personalEmail || null,
      education: row.education.trim() || null,
      maritalStatus: maritalStatus ? (maritalStatus as MaritalStatus) : null,
      permanentAddress: row.permanentAddress.trim() || null,
      currentAddress: row.currentAddress.trim() || null,
      emergencyContactName: row.emergencyContactName.trim() || null,
      emergencyContactRelationship: row.emergencyContactRelationship.trim() || null,
      emergencyContactPhone: row.emergencyContactPhone.trim() || null,
      bankAccountNumber: row.bankAccountNumber.trim() || null,
      bankName: row.bankName.trim() || null,
      bankBranch: row.bankBranch.trim() || null,
      taxCode: row.taxCode.trim() || null,
      socialInsuranceNumber: row.socialInsuranceNumber.trim() || null,
      healthcareFacility: row.healthcareFacility.trim() || null,
      motorbikeRegistration: row.motorbikeRegistration.trim() || null,
    });
  }

  return { valid, errors };
}
