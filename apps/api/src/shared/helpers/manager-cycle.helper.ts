/**
 * Determine whether assigning `candidateManagerId` as the manager of
 * `employeeId` would create a cycle in the reporting line (e.g. A → B → A).
 *
 * Walks the manager chain upward from the candidate. If the chain reaches the
 * employee, the assignment would close a loop. The `resolveManagerId` callback
 * is injected so this stays a pure, database-free unit (the service passes a
 * repository-backed resolver).
 *
 * Self-management (employee === candidate) counts as a cycle. A `visited` guard
 * ensures termination even if the existing data already contains an unrelated
 * cycle.
 */
export async function wouldCreateManagerCycle(
  employeeId: string,
  candidateManagerId: string,
  resolveManagerId: (id: string) => Promise<string | null>
): Promise<boolean> {
  if (employeeId === candidateManagerId) return true;

  const visited = new Set<string>();
  let cursor: string | null = candidateManagerId;

  while (cursor) {
    if (cursor === employeeId) return true;
    if (visited.has(cursor)) break; // pre-existing loop not involving employee
    visited.add(cursor);
    cursor = await resolveManagerId(cursor);
  }

  return false;
}
