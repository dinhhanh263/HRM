import { db } from '../../infrastructure/database/client.js';

/**
 * Batch, read-only lookups used by the import dry-run validator. Each method is
 * a single tenant-scoped query over an `IN (...)` list so validating 5,000 rows
 * costs a handful of queries rather than thousands. Nothing here writes.
 */
export const employeeImportRepository = {
  /** Emails (lowercased) that already belong to a user in this tenant. */
  async existingEmails(tenantId: string, emails: string[]): Promise<Set<string>> {
    if (emails.length === 0) return new Set();
    const rows = await db.user.findMany({
      where: { tenantId, email: { in: emails } },
      select: { email: true },
    });
    return new Set(rows.map((r) => r.email.toLowerCase()));
  },

  /** ID numbers that already belong to an employee in this tenant. */
  async existingIdNumbers(tenantId: string, idNumbers: string[]): Promise<Set<string>> {
    if (idNumbers.length === 0) return new Set();
    const rows = await db.employee.findMany({
      where: { tenantId, idNumber: { in: idNumbers } },
      select: { idNumber: true },
    });
    return new Set(rows.map((r) => r.idNumber).filter((v): v is string => v !== null));
  },

  /** Department names (as stored) that already exist in this tenant. */
  async existingDepartmentNames(tenantId: string, names: string[]): Promise<Set<string>> {
    if (names.length === 0) return new Set();
    const rows = await db.department.findMany({
      where: { tenantId, name: { in: names } },
      select: { name: true },
    });
    return new Set(rows.map((r) => r.name));
  },

  /** Position names (as stored) that already exist in this tenant. */
  async existingPositionNames(tenantId: string, names: string[]): Promise<Set<string>> {
    if (names.length === 0) return new Set();
    const rows = await db.position.findMany({
      where: { tenantId, name: { in: names } },
      select: { name: true },
    });
    return new Set(rows.map((r) => r.name));
  },

  /**
   * Manager references that resolve to an existing employee in this tenant.
   * A manager column may hold either the manager's login email or their
   * employee code, so we match on both. Returns the set of *resolvable*
   * reference strings (lowercased emails + raw codes) found in the DB.
   */
  async resolvableManagerRefs(tenantId: string, refs: string[]): Promise<Set<string>> {
    if (refs.length === 0) return new Set();
    const lowered = refs.map((r) => r.toLowerCase());
    const rows = await db.employee.findMany({
      where: {
        tenantId,
        OR: [{ employeeCode: { in: refs } }, { user: { email: { in: lowered } } }],
      },
      select: { employeeCode: true, user: { select: { email: true } } },
    });
    const resolved = new Set<string>();
    for (const r of rows) {
      if (r.employeeCode) resolved.add(r.employeeCode);
      if (r.user?.email) resolved.add(r.user.email.toLowerCase());
    }
    return resolved;
  },

  /**
   * Resolve manager references to employee ids in one query. Keys the result by
   * BOTH employee code (as stored) and lowercased login email so the processor
   * can look up by whichever form the import file used.
   */
  async resolveManagerIds(tenantId: string, refs: string[]): Promise<Map<string, string>> {
    if (refs.length === 0) return new Map();
    const lowered = refs.map((r) => r.toLowerCase());
    const rows = await db.employee.findMany({
      where: {
        tenantId,
        OR: [{ employeeCode: { in: refs } }, { user: { email: { in: lowered } } }],
      },
      select: { id: true, employeeCode: true, user: { select: { email: true } } },
    });
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.employeeCode) map.set(r.employeeCode, r.id);
      if (r.user?.email) map.set(r.user.email.toLowerCase(), r.id);
    }
    return map;
  },

  /** Map existing department names → id for this tenant. */
  async departmentIdsByName(tenantId: string, names: string[]): Promise<Map<string, string>> {
    if (names.length === 0) return new Map();
    const rows = await db.department.findMany({
      where: { tenantId, name: { in: names } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.name, r.id]));
  },

  /** Map existing position names → id for this tenant. */
  async positionIdsByName(tenantId: string, names: string[]): Promise<Map<string, string>> {
    if (names.length === 0) return new Map();
    const rows = await db.position.findMany({
      where: { tenantId, name: { in: names } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.name, r.id]));
  },

  /**
   * Idempotently create a department by name (unique on [tenantId, name]).
   * `upsert` keeps a concurrent re-run from throwing on the unique constraint.
   */
  async upsertDepartmentByName(tenantId: string, name: string): Promise<string> {
    const dept = await db.department.upsert({
      where: { tenantId_name: { tenantId, name } },
      update: {},
      create: { tenantId, name },
      select: { id: true },
    });
    return dept.id;
  },

  /** Idempotently create a position by name (unique on [tenantId, name]). */
  async upsertPositionByName(tenantId: string, name: string): Promise<string> {
    const position = await db.position.upsert({
      where: { tenantId_name: { tenantId, name } },
      update: {},
      create: { tenantId, name },
      select: { id: true },
    });
    return position.id;
  },
};
