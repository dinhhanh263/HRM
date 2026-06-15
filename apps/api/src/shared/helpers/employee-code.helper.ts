import { db } from '../../infrastructure/database/client.js';

/** Format a numeric sequence as an employee code (min 3-digit zero padding). */
export function formatEmployeeCode(sequence: number): string {
  return `EMP-${sequence.toString().padStart(3, '0')}`;
}

/** Parse the numeric suffix from an employee code, or 0 if it isn't numeric. */
export function parseEmployeeCodeNumber(code: string): number {
  const n = parseInt(code.split('-')[1] ?? '', 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Pure: build a contiguous block of `count` employee codes that follow the
 * highest existing sequence. Unit-testable without a database. Lexicographic
 * `orderBy` breaks past EMP-999, so the caller computes `maxExisting` from the
 * numeric suffixes rather than a string sort.
 */
export function buildEmployeeCodeBlock(maxExisting: number, count: number): string[] {
  const block: string[] = [];
  for (let i = 1; i <= count; i++) {
    block.push(formatEmployeeCode(maxExisting + i));
  }
  return block;
}

/**
 * Allocate the next single employee code for a tenant. Delegates to
 * `allocateEmployeeCodeBlock` so the next number is the true numeric MAX
 * computed DB-side. A naive `orderBy: { employeeCode: 'desc' }` sorts
 * lexicographically — a non-numeric code such as `EMP-PA01` ranks above
 * `EMP-904` ('P' > '9'), `parseInt` then yields NaN, and every create
 * regenerates a colliding `EMP-NaN`. The block helper avoids both that and the
 * EMP-999 → EMP-1000 break.
 */
export async function generateEmployeeCode(tenantId: string): Promise<string> {
  const [code] = await allocateEmployeeCodeBlock(tenantId, 1);
  return code;
}

/**
 * Allocate a contiguous block of employee codes for a bulk import. The numeric
 * maximum is computed inside the database so memory stays bounded regardless of
 * tenant size (a 50k-employee tenant returns one row, not 50k). The trailing
 * digit run is extracted and cast to an integer so the max is truly numeric —
 * a lexicographic `ORDER BY employee_code` would rank EMP-999 above EMP-1000.
 * Codes with no numeric suffix yield NULL and are ignored by MAX; an empty
 * tenant yields NULL, which we treat as 0 (block starts at EMP-001).
 */
export async function allocateEmployeeCodeBlock(
  tenantId: string,
  count: number,
): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(CAST(SUBSTRING(employee_code FROM '[0-9]+$') AS INTEGER)) AS max
    FROM employees
    WHERE tenant_id = ${tenantId}
  `;
  const maxExisting = rows[0]?.max ?? 0;
  return buildEmployeeCodeBlock(maxExisting, count);
}
