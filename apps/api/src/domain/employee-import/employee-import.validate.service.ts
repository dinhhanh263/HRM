import {
  IMPORT_ERROR_CODES,
  type ImportOptions,
  type ImportRowError,
  type ImportValidationSummary,
  type ValidatedImportRow,
} from '@hrm/shared';
import { IMPORT_MAX_ROWS } from '../../shared/configs/import.config.js';
import { employeeImportRepository } from '../repositories/employee-import.repository.js';
import { parseEmployeeFile, type ImportFileFormat } from './employee-import.parser.js';
import { validateRows } from './employee-import.validator.js';
import { stageImport } from './employee-import.staging.js';

function emptySummary(errors: ImportRowError[], totalRows = 0): ImportValidationSummary {
  return {
    importId: null,
    totalRows,
    validCount: 0,
    errorCount: errors.length,
    errors,
    newDepartments: [],
    newPositions: [],
  };
}

/**
 * Dry-run a bulk import file: parse → per-row validation (pure) → DB-dependent
 * uniqueness + manager resolvability checks. Writes NOTHING to the database. On
 * success, the rows that passed every check are staged in Redis under a fresh
 * `importId` (returned in the summary) for the subsequent `/import` call.
 */
export async function validateImportFile(
  tenantId: string,
  buffer: Buffer,
  format: ImportFileFormat,
  options: ImportOptions,
): Promise<ImportValidationSummary> {
  // 1) Parse. File-level problems (unreadable/empty/missing columns) end here.
  const { rows, errors: fileErrors } = await parseEmployeeFile(buffer, format);
  if (fileErrors.length > 0) {
    return emptySummary(fileErrors);
  }

  // 2) Hard cap on row count (protects the worker + memory).
  if (rows.length > IMPORT_MAX_ROWS) {
    return emptySummary(
      [
        {
          row: 0,
          column: null,
          code: IMPORT_ERROR_CODES.TOO_MANY_ROWS,
          message: `File has ${rows.length} rows; the maximum is ${IMPORT_MAX_ROWS}`,
        },
      ],
      rows.length,
    );
  }

  // 3) Pure per-row validation + in-file email dedupe.
  const { valid, errors: rowErrors } = validateRows(rows);
  const allErrors: ImportRowError[] = [...rowErrors];

  // 4) DB-dependent checks — batched so cost is O(queries), not O(rows).
  const emails = valid.map((r) => r.email);
  const employeeCodes = valid.map((r) => r.employeeCode);
  const idNumbers = valid.map((r) => r.idNumber).filter((v): v is string => v !== null);
  const managerRefs = valid.map((r) => r.manager).filter((v): v is string => v !== null);

  const [existingEmails, existingEmployeeCodes, existingIdNumbers, resolvableManagers] =
    await Promise.all([
      employeeImportRepository.existingEmails(tenantId, emails),
      employeeImportRepository.existingEmployeeCodes(tenantId, employeeCodes),
      employeeImportRepository.existingIdNumbers(tenantId, idNumbers),
      employeeImportRepository.resolvableManagerRefs(tenantId, managerRefs),
    ]);

  // New rows can be managers of other new rows (forward reference resolved in
  // the worker's two-pass linking), so a manager is resolvable if it matches a
  // valid row's email in THIS file too.
  const newRowEmails = new Set(valid.map((r) => r.email));
  const seenIdNumbers = new Set<string>();

  const finalValid: ValidatedImportRow[] = [];
  for (const row of valid) {
    const extra: ImportRowError[] = [];

    if (existingEmails.has(row.email)) {
      extra.push({
        row: row.rowNumber,
        column: 'email',
        code: IMPORT_ERROR_CODES.EMAIL_EXISTS,
        message: `An account already exists for ${row.email}`,
      });
    }

    if (existingEmployeeCodes.has(row.employeeCode)) {
      extra.push({
        row: row.rowNumber,
        column: 'employeeCode',
        code: IMPORT_ERROR_CODES.EMPLOYEE_CODE_EXISTS,
        message: `An employee already exists with code ${row.employeeCode}`,
      });
    }

    if (row.idNumber) {
      if (existingIdNumbers.has(row.idNumber) || seenIdNumbers.has(row.idNumber)) {
        extra.push({
          row: row.rowNumber,
          column: 'idNumber',
          code: IMPORT_ERROR_CODES.IDNUMBER_DUPLICATE,
          message: `Duplicate ID number: ${row.idNumber}`,
        });
      } else {
        seenIdNumbers.add(row.idNumber);
      }
    }

    if (row.manager) {
      const ref = row.manager;
      const refLower = ref.toLowerCase();
      const resolvable =
        newRowEmails.has(refLower) || resolvableManagers.has(ref) || resolvableManagers.has(refLower);
      if (!resolvable) {
        extra.push({
          row: row.rowNumber,
          column: 'manager',
          code: IMPORT_ERROR_CODES.MANAGER_NOT_FOUND,
          message: `Manager not found (by email or employee code): ${ref}`,
        });
      }
    }

    if (extra.length > 0) {
      allErrors.push(...extra);
    } else {
      finalValid.push(row);
    }
  }

  // 5) Detect org units referenced by valid rows that don't exist yet.
  const deptNames = Array.from(
    new Set(finalValid.map((r) => r.department).filter((v): v is string => v !== null)),
  );
  const posNames = Array.from(
    new Set(finalValid.map((r) => r.position).filter((v): v is string => v !== null)),
  );
  const [existingDepts, existingPositions] = await Promise.all([
    employeeImportRepository.existingDepartmentNames(tenantId, deptNames),
    employeeImportRepository.existingPositionNames(tenantId, posNames),
  ]);
  const newDepartments = deptNames.filter((n) => !existingDepts.has(n));
  const newPositions = posNames.filter((n) => !existingPositions.has(n));

  // 6) Stage the clean rows for /import (only when there's something to import).
  let importId: string | null = null;
  if (finalValid.length > 0) {
    importId = await stageImport({
      tenantId,
      createdAt: new Date().toISOString(),
      options,
      rows: finalValid,
    });
  }

  // Keep errors ordered by row for a readable report.
  allErrors.sort((a, b) => a.row - b.row);

  return {
    importId,
    totalRows: rows.length,
    validCount: finalValid.length,
    errorCount: allErrors.length,
    errors: allErrors,
    newDepartments,
    newPositions,
  };
}
