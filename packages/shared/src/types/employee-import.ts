// Employee bulk import — shared contract between the API (parser + validator +
// worker) and the web import wizard. Error codes are stable machine strings;
// the web client maps each code to an i18n message (vi/en).

import type { ContractType, Gender, MaritalStatus } from './employee.js';

/** Stable, machine-readable validation/processing error codes. */
export const IMPORT_ERROR_CODES = {
  // File-level guards
  FILE_TOO_LARGE: 'IMPORT_FILE_TOO_LARGE',
  TOO_MANY_ROWS: 'IMPORT_TOO_MANY_ROWS',
  EMPTY_FILE: 'IMPORT_EMPTY_FILE',
  UNREADABLE_FILE: 'IMPORT_UNREADABLE_FILE',
  MISSING_COLUMNS: 'IMPORT_MISSING_COLUMNS',
  // Per-row validation (pure)
  MISSING_REQUIRED: 'IMPORT_MISSING_REQUIRED',
  INVALID_EMAIL: 'IMPORT_INVALID_EMAIL',
  INVALID_DATE: 'IMPORT_INVALID_DATE',
  INVALID_ENUM: 'IMPORT_INVALID_ENUM',
  INVALID_NUMBER: 'IMPORT_INVALID_NUMBER',
  EMAIL_DUPLICATE_IN_FILE: 'IMPORT_EMAIL_DUPLICATE_IN_FILE',
  // DB-dependent (resolved later in validate/import service)
  EMAIL_EXISTS: 'IMPORT_EMAIL_EXISTS',
  IDNUMBER_DUPLICATE: 'IMPORT_IDNUMBER_DUPLICATE',
  MANAGER_NOT_FOUND: 'IMPORT_MANAGER_NOT_FOUND',
  MANAGER_CYCLE: 'IMPORT_MANAGER_CYCLE',
  // Staging / job lifecycle (between /validate, /import and the worker)
  STAGING_NOT_FOUND: 'IMPORT_STAGING_NOT_FOUND',
  ROW_WRITE_FAILED: 'IMPORT_ROW_WRITE_FAILED',
} as const;

export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[keyof typeof IMPORT_ERROR_CODES];

/** The canonical import column keys (also the template header keys). */
export const IMPORT_COLUMNS = [
  'fullName',
  'email',
  'dateOfBirth',
  'gender',
  'idNumber',
  'phone',
  'department',
  'position',
  'manager',
  'joinDate',
  'contractType',
  'dependentsCount',
  'role',
  // Extended profile fields (SPEC-040) — all optional.
  'placeOfBirth',
  'idIssueDate',
  'idIssuePlace',
  'personalEmail',
  'education',
  'maritalStatus',
  'permanentAddress',
  'currentAddress',
  'emergencyContactName',
  'emergencyContactRelationship',
  'emergencyContactPhone',
  'bankAccountNumber',
  'bankName',
  'bankBranch',
  'taxCode',
  'socialInsuranceNumber',
  'healthcareFacility',
  'motorbikeRegistration',
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** Columns that must be present (with a value) for a row to be importable. */
export const REQUIRED_IMPORT_COLUMNS = ['fullName', 'email'] as const satisfies readonly ImportColumn[];

/** Supported template/header languages. */
export type ImportLang = 'vi' | 'en';

/**
 * Localized, human-friendly header label for each column. These are the headers
 * written into the downloadable templates; the parser also registers them as
 * aliases so a filled-in localized template re-imports cleanly (round-trip).
 */
export const IMPORT_COLUMN_LABELS: Record<ImportColumn, Record<ImportLang, string>> = {
  fullName: { vi: 'Họ và tên', en: 'Full name' },
  email: { vi: 'Email', en: 'Email' },
  dateOfBirth: { vi: 'Ngày sinh', en: 'Date of birth' },
  gender: { vi: 'Giới tính', en: 'Gender' },
  idNumber: { vi: 'Số CCCD/CMND', en: 'ID number' },
  phone: { vi: 'Số điện thoại', en: 'Phone' },
  department: { vi: 'Phòng ban', en: 'Department' },
  position: { vi: 'Vị trí', en: 'Position' },
  manager: { vi: 'Email quản lý', en: 'Manager email' },
  joinDate: { vi: 'Ngày vào làm', en: 'Join date' },
  contractType: { vi: 'Loại hợp đồng', en: 'Contract type' },
  dependentsCount: { vi: 'Số người phụ thuộc', en: 'Dependents' },
  role: { vi: 'Vai trò', en: 'Role' },
  placeOfBirth: { vi: 'Nơi sinh', en: 'Place of birth' },
  idIssueDate: { vi: 'Ngày cấp CCCD', en: 'ID issue date' },
  idIssuePlace: { vi: 'Nơi cấp CCCD', en: 'ID issue place' },
  personalEmail: { vi: 'Email cá nhân', en: 'Personal email' },
  education: { vi: 'Trình độ học vấn', en: 'Education' },
  maritalStatus: { vi: 'Tình trạng hôn nhân', en: 'Marital status' },
  permanentAddress: { vi: 'Địa chỉ thường trú', en: 'Permanent address' },
  currentAddress: { vi: 'Địa chỉ tạm trú', en: 'Current address' },
  emergencyContactName: { vi: 'Người liên hệ khẩn cấp', en: 'Emergency contact name' },
  emergencyContactRelationship: { vi: 'Mối quan hệ (khẩn cấp)', en: 'Emergency relationship' },
  emergencyContactPhone: { vi: 'SĐT khẩn cấp', en: 'Emergency phone' },
  bankAccountNumber: { vi: 'Số tài khoản', en: 'Bank account number' },
  bankName: { vi: 'Tên ngân hàng', en: 'Bank name' },
  bankBranch: { vi: 'Chi nhánh ngân hàng', en: 'Bank branch' },
  taxCode: { vi: 'Mã số thuế', en: 'Tax code' },
  socialInsuranceNumber: { vi: 'Mã số BHXH', en: 'Social insurance number' },
  healthcareFacility: { vi: 'Nơi đăng ký KCB', en: 'Healthcare facility' },
  motorbikeRegistration: { vi: 'Đăng ký xe máy', en: 'Motorbike registration' },
};

/** Allowed values for the dropdown (enum) columns in the template. */
export const IMPORT_ENUM_OPTIONS = {
  gender: ['MALE', 'FEMALE', 'OTHER'],
  contractType: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'PROBATION'],
  role: ['EMPLOYEE', 'MANAGER', 'HR_MANAGER'],
  maritalStatus: ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'OTHER'],
} as const satisfies Partial<Record<ImportColumn, readonly string[]>>;

/** A single parsed row, normalized (trimmed; email lowercased). `rowNumber`
 * is the 1-based spreadsheet row (header excluded) for error reporting. */
export interface ParsedImportRow {
  rowNumber: number;
  fullName: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  idNumber: string;
  phone: string;
  department: string;
  position: string;
  manager: string;
  joinDate: string;
  contractType: string;
  dependentsCount: string;
  role: string;
  // Extended profile fields (SPEC-040) — raw cell text, normalized in validation.
  placeOfBirth: string;
  idIssueDate: string;
  idIssuePlace: string;
  personalEmail: string;
  education: string;
  maritalStatus: string;
  permanentAddress: string;
  currentAddress: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  bankAccountNumber: string;
  bankName: string;
  bankBranch: string;
  taxCode: string;
  socialInsuranceNumber: string;
  healthcareFacility: string;
  motorbikeRegistration: string;
}

/** A normalized row that has passed per-row validation (typed enums applied). */
export interface ValidatedImportRow {
  rowNumber: number;
  fullName: string;
  email: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  idNumber: string | null;
  phone: string | null;
  department: string | null;
  position: string | null;
  manager: string | null;
  joinDate: string | null;
  contractType: ContractType;
  dependentsCount: number;
  role: 'EMPLOYEE' | 'MANAGER' | 'HR_MANAGER';
  // Extended profile fields (SPEC-040) — blanks normalized to null.
  placeOfBirth: string | null;
  idIssueDate: string | null;
  idIssuePlace: string | null;
  personalEmail: string | null;
  education: string | null;
  maritalStatus: MaritalStatus | null;
  permanentAddress: string | null;
  currentAddress: string | null;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  bankAccountNumber: string | null;
  bankName: string | null;
  bankBranch: string | null;
  taxCode: string | null;
  socialInsuranceNumber: string | null;
  healthcareFacility: string | null;
  motorbikeRegistration: string | null;
}

/** One validation problem tied to a row (and optionally a column). */
export interface ImportRowError {
  row: number;
  column: ImportColumn | null;
  code: ImportErrorCode;
  message: string;
}

/** How the import treats rows whose email already exists. v1 supports `skip`. */
export type ImportDuplicateMode = 'skip';

/** Per-run options carried from the wizard through `/validate` to `/import`. */
export interface ImportOptions {
  /** Create departments/positions referenced by name when they don't exist. */
  autoCreateOrgUnits: boolean;
  /** What to do when an email already exists in the tenant. */
  duplicateMode: ImportDuplicateMode;
}

/**
 * The dry-run result of `POST /employees/import/validate`. No DB writes happen
 * to produce it. When at least one row is valid, the valid rows are staged in
 * Redis under `importId` so `/import` can reference them without re-uploading.
 */
export interface ImportValidationSummary {
  /** Staging key for `/import`; null when there are no valid rows to stage. */
  importId: string | null;
  totalRows: number;
  validCount: number;
  errorCount: number;
  errors: ImportRowError[];
  /** Distinct department names referenced by valid rows that don't yet exist. */
  newDepartments: string[];
  /** Distinct position names referenced by valid rows that don't yet exist. */
  newPositions: string[];
}

/** Server-side staged payload kept in Redis between `/validate` and `/import`. */
export interface StagedImport {
  tenantId: string;
  createdAt: string;
  options: ImportOptions;
  rows: ValidatedImportRow[];
}

/**
 * The outcome of running an import (the worker's result, also returned by
 * `GET /employees/import/:jobId`). `created + skipped + failed === total`.
 */
export interface ImportJobResult {
  total: number;
  /** New User(invited)+Employee pairs created. */
  created: number;
  /** Rows skipped because the email already exists (duplicateMode=skip). */
  skipped: number;
  /** Rows that errored during the write phase (per-row, non-aborting). */
  failed: number;
  errors: ImportRowError[];
}

/** Lifecycle state of an import job, normalized from the queue's own states. */
export type ImportJobState = 'waiting' | 'active' | 'completed' | 'failed' | 'unknown';

/** Live progress of a running import (rows written so far / rows to write). */
export interface ImportJobProgress {
  done: number;
  total: number;
}

/**
 * Response of `POST /employees/import` (returns just `jobId`, the rest null until
 * polled) and `GET /employees/import/:jobId`. The web wizard polls the GET until
 * `state` is `completed` (then reads `result`) or `failed`.
 */
export interface ImportJobStatus {
  jobId: string;
  state: ImportJobState;
  /** Null while waiting or once finished; populated while `active`. */
  progress: ImportJobProgress | null;
  /** Populated only when `state === 'completed'`. */
  result: ImportJobResult | null;
}
