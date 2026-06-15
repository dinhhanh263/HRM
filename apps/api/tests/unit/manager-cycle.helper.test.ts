import { describe, it, expect } from 'vitest';
import { wouldCreateManagerCycle } from '../../src/shared/helpers/manager-cycle.helper.js';

/**
 * Build an async resolver from a plain id -> managerId map so the cycle
 * detector can be tested without a database.
 */
function resolverFrom(chain: Record<string, string | null>) {
  return async (id: string) => chain[id] ?? null;
}

describe('wouldCreateManagerCycle', () => {
  it('flags self-management as a cycle', async () => {
    const resolve = resolverFrom({});
    expect(await wouldCreateManagerCycle('A', 'A', resolve)).toBe(true);
  });

  it('allows a manager who has no manager of their own', async () => {
    // B has no manager → assigning B as A's manager is safe
    const resolve = resolverFrom({ B: null });
    expect(await wouldCreateManagerCycle('A', 'B', resolve)).toBe(false);
  });

  it('allows a deep chain that never returns to the employee', async () => {
    // B -> C -> D -> null. Assign B as A's manager → no cycle.
    const resolve = resolverFrom({ B: 'C', C: 'D', D: null });
    expect(await wouldCreateManagerCycle('A', 'B', resolve)).toBe(false);
  });

  it('detects a direct two-node cycle (A manages B, assign B as A manager)', async () => {
    // B currently reports to A. Assigning B as A's manager closes the loop.
    const resolve = resolverFrom({ B: 'A' });
    expect(await wouldCreateManagerCycle('A', 'B', resolve)).toBe(true);
  });

  it('detects a deep cycle back to the employee', async () => {
    // B -> C -> A. Assigning B as A's manager would loop back to A.
    const resolve = resolverFrom({ B: 'C', C: 'A' });
    expect(await wouldCreateManagerCycle('A', 'B', resolve)).toBe(true);
  });

  it('stops safely if the existing data already contains an unrelated cycle', async () => {
    // C -> D -> C is a pre-existing loop that does not involve A.
    // Detector must terminate and report no new cycle for A.
    const resolve = resolverFrom({ B: 'C', C: 'D', D: 'C' });
    expect(await wouldCreateManagerCycle('A', 'B', resolve)).toBe(false);
  });
});
