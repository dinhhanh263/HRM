import {
  IMPORT_ERROR_CODES,
  type ImportJobResult,
  type ImportOptions,
  type ImportRowError,
  type ValidatedImportRow,
} from '@hrm/shared';
import { db } from '../../infrastructure/database/client.js';
import { employeeRepository } from '../repositories/employee.repository.js';
import { employeeImportRepository } from '../repositories/employee-import.repository.js';
import { roleRepository } from '../repositories/role.repository.js';
import { roleKeyForUserRole } from '../rbac/catalog.js';
import { allocateEmployeeCodeBlock } from '../../shared/helpers/employee-code.helper.js';
import { wouldCreateManagerCycle } from '../../shared/helpers/manager-cycle.helper.js';
import { leaveAllocationService } from '../services/leave-allocation.service.js';
import { logger } from '../../shared/utils/logger.js';

type ImportRole = ValidatedImportRow['role'];

/**
 * Placeholder hash stored on imported (INVITED) users. It is intentionally NOT
 * a valid bcrypt digest, so `bcrypt.compare` can never succeed against it — and
 * login additionally requires `status === ACTIVE`, which an INVITED user is
 * not. The real hash is written only when the user sets a password via the
 * emailed invite token. Keeping bcrypt out of the import path is deliberate:
 * hashing 5,000 passwords would dominate the run for no benefit.
 */
const INVITED_PASSWORD_PLACEHOLDER = 'invited:no-password';

/** Distinct, non-null values preserving first-seen order. */
function distinct(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => v !== null)));
}

/**
 * Resolve every department/position name referenced by the rows to an id. When
 * `autoCreateOrgUnits` is true, names that don't exist yet are created (once);
 * otherwise unknown names are simply left unmapped and the row is imported with
 * no department/position.
 */
async function resolveOrgUnits(
  tenantId: string,
  rows: ValidatedImportRow[],
  autoCreateOrgUnits: boolean,
): Promise<{ deptByName: Map<string, string>; posByName: Map<string, string> }> {
  const deptNames = distinct(rows.map((r) => r.department));
  const posNames = distinct(rows.map((r) => r.position));

  const [deptByName, posByName] = await Promise.all([
    employeeImportRepository.departmentIdsByName(tenantId, deptNames),
    employeeImportRepository.positionIdsByName(tenantId, posNames),
  ]);

  if (autoCreateOrgUnits) {
    for (const name of deptNames) {
      if (!deptByName.has(name)) {
        deptByName.set(name, await employeeImportRepository.upsertDepartmentByName(tenantId, name));
      }
    }
    for (const name of posNames) {
      if (!posByName.has(name)) {
        posByName.set(name, await employeeImportRepository.upsertPositionByName(tenantId, name));
      }
    }
  }

  return { deptByName, posByName };
}

/**
 * Resolve each distinct role referenced by the rows to its tenant Role row id —
 * the column RBAC actually reads (`user.roleId`). Resolved once per distinct
 * role (≤ 3 here), not per row. A missing system role is a tenant-wide
 * misconfiguration that would fail every row identically, so we abort the run
 * rather than recording thousands of per-row failures.
 */
async function resolveRoleIds(
  tenantId: string,
  rows: ValidatedImportRow[],
): Promise<Map<ImportRole, string>> {
  const map = new Map<ImportRole, string>();
  for (const role of new Set(rows.map((r) => r.role))) {
    const roleRow = await roleRepository.findByKey(roleKeyForUserRole(role), tenantId);
    if (!roleRow) {
      throw new Error(`Role "${role}" not provisioned for tenant ${tenantId}`);
    }
    map.set(role, roleRow.id);
  }
  return map;
}

/**
 * Run a staged bulk import. Two passes:
 *
 *  1. Create one User(INVITED) + Employee per row. Emails that already exist in
 *     the tenant are skipped (duplicateMode='skip') so a re-run is idempotent —
 *     re-importing the same file creates 0 new records. Employee codes are
 *     allocated as one contiguous block. Each row is its own transaction so a
 *     single bad row fails in isolation (partial success, never aborting).
 *  2. Link direct managers. A manager reference resolves against rows created in
 *     THIS run (forward references, by email) first, then against existing
 *     employees in the tenant (by employee code or email). A cycle guard rejects
 *     links that would close a reporting loop.
 *
 * No bcrypt runs here (see INVITED_PASSWORD_PLACEHOLDER). Returns a per-run
 * report where `created + skipped + failed === total`.
 *
 * `onUserCreated` fires once per successfully created user (after the row's
 * transaction commits). It lets the caller fan out invite emails without
 * coupling this processor to the email queue.
 */
export interface CreatedUser {
  userId: string;
  email: string;
  fullName: string;
}

export async function processImport(
  tenantId: string,
  rows: ValidatedImportRow[],
  options: ImportOptions,
  onProgress?: (done: number, total: number) => void,
  onUserCreated?: (user: CreatedUser) => void,
): Promise<ImportJobResult> {
  const total = rows.length;
  const errors: ImportRowError[] = [];

  // Idempotency: skip rows whose email already has an account in this tenant.
  const existingEmails = await employeeImportRepository.existingEmails(
    tenantId,
    rows.map((r) => r.email),
  );
  const toCreate = rows.filter((r) => !existingEmails.has(r.email.toLowerCase()));
  const skipped = total - toCreate.length;

  const { deptByName, posByName } = await resolveOrgUnits(
    tenantId,
    toCreate,
    options.autoCreateOrgUnits,
  );

  // RBAC authority lives on user.roleId, not the legacy role enum. Resolve it up
  // front so imported users get the right permission set (a null roleId resolves
  // to zero permissions — every requirePermission check would fail).
  const roleIdByRole = await resolveRoleIds(tenantId, toCreate);

  // One contiguous code block for the rows we intend to create. A row that
  // fails leaves a gap in the sequence — acceptable; codes need only be unique.
  const codes = await allocateEmployeeCodeBlock(tenantId, toCreate.length);

  // emailLower → created employee id (drives pass-2 forward references).
  const createdByEmail = new Map<string, string>();
  let created = 0;
  let failed = 0;

  // --- Pass 1: create User(INVITED) + Employee ---
  for (let i = 0; i < toCreate.length; i++) {
    const row = toCreate[i];
    try {
      const { employeeId, userId } = await db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            tenantId,
            email: row.email,
            passwordHash: INVITED_PASSWORD_PLACEHOLDER,
            fullName: row.fullName,
            role: row.role,
            roleId: roleIdByRole.get(row.role)!,
            status: 'INVITED',
          },
        });

        const employee = await tx.employee.create({
          data: {
            tenantId,
            userId: user.id,
            employeeCode: codes[i],
            fullName: row.fullName,
            dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : undefined,
            gender: row.gender ?? undefined,
            idNumber: row.idNumber ?? undefined,
            phone: row.phone ?? undefined,
            joinDate: row.joinDate ? new Date(row.joinDate) : new Date(),
            contractType: row.contractType,
            dependentsCount: row.dependentsCount,
            status: 'ACTIVE',
            departmentId: row.department ? (deptByName.get(row.department) ?? null) : null,
            positionId: row.position ? (posByName.get(row.position) ?? null) : null,
          },
          select: { id: true },
        });

        return { employeeId: employee.id, userId: user.id };
      });

      createdByEmail.set(row.email.toLowerCase(), employeeId);
      created++;

      // Best-effort pro-rata seeding (same join-date fallback as the row write).
      // A failure here must not fail the row — the employee already committed —
      // so it is logged and swallowed, mirroring the single-create hook.
      const joinDate = row.joinDate ? new Date(row.joinDate) : new Date();
      try {
        await leaveAllocationService.seedProratedAllocations(tenantId, employeeId, joinDate);
      } catch (err) {
        logger.error(
          { event: 'employee_import.prorata_seed_failed', tenantId, row: row.rowNumber, err },
          'Failed to seed pro-rated leave allocations for imported employee',
        );
      }

      onUserCreated?.({ userId, email: row.email, fullName: row.fullName });
    } catch (err) {
      failed++;
      // Log the raw cause server-side for diagnosis, but never surface it in the
      // user-facing report: Prisma messages can include constraint names and
      // fragments of the offending value (email/idNumber → PII). The report gets
      // a stable, localizable code instead.
      logger.error(
        { event: 'employee_import.row_write_failed', tenantId, row: row.rowNumber, err },
        'Import row write failed',
      );
      errors.push({
        row: row.rowNumber,
        column: null,
        code: IMPORT_ERROR_CODES.ROW_WRITE_FAILED,
        message: 'Failed to create employee for this row',
      });
    }

    onProgress?.(i + 1, toCreate.length);
  }

  // --- Pass 2: link direct managers ---
  const linkable = toCreate.filter(
    (r) => r.manager !== null && createdByEmail.has(r.email.toLowerCase()),
  );

  // Refs not satisfiable from this run's rows must come from existing employees.
  const dbRefs = distinct(
    linkable
      .map((r) => r.manager)
      .filter((ref): ref is string => ref !== null && !createdByEmail.has(ref.toLowerCase())),
  );
  const dbManagerIds = await employeeImportRepository.resolveManagerIds(tenantId, dbRefs);

  for (const row of linkable) {
    const employeeId = createdByEmail.get(row.email.toLowerCase())!;
    const ref = row.manager!;
    const refLower = ref.toLowerCase();
    const managerId =
      createdByEmail.get(refLower) ?? dbManagerIds.get(ref) ?? dbManagerIds.get(refLower) ?? null;

    // Manager unresolved at write time (e.g. its row failed in pass 1): leave
    // the report unlinked rather than aborting.
    if (!managerId) continue;

    const cycle = await wouldCreateManagerCycle(employeeId, managerId, (id) =>
      employeeRepository.findManagerId(id, tenantId),
    );
    if (cycle) {
      errors.push({
        row: row.rowNumber,
        column: 'manager',
        code: IMPORT_ERROR_CODES.MANAGER_CYCLE,
        message: `Skipped manager link for ${row.email}: would create a reporting cycle`,
      });
      continue;
    }

    await db.employee.update({
      where: { id: employeeId, tenantId },
      data: { managerId },
    });
  }

  errors.sort((a, b) => a.row - b.row);

  return { total, created, skipped, failed, errors };
}
