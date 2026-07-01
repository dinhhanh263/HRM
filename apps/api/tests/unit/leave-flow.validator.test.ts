import { describe, it, expect } from 'vitest';
import {
  createApprovalFlowSchema,
  updateApprovalFlowSchema,
  replaceWatchersSchema,
} from '../../src/app/validators/leave.validator.js';

const CUID = 'clkv1a2b3c4d5e6f7g8h9i0j'; // shape-valid cuid for SPECIFIC_USER cases

describe('approval flow watcher validation (SPEC-046)', () => {
  it('accepts a flow with ROLE and SPECIFIC_USER watchers', () => {
    const parsed = createApprovalFlowSchema.safeParse({
      name: 'HR-watched flow',
      steps: [{ approverType: 'MANAGER' }],
      watchers: [
        { watcherType: 'ROLE', roleKey: 'hr-manager' },
        { watcherType: 'SPECIFIC_USER', watcherId: CUID },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a flow with an empty watcher list', () => {
    const parsed = createApprovalFlowSchema.safeParse({
      name: 'No CC',
      steps: [{ approverType: 'MANAGER' }],
      watchers: [],
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a flow with no watchers field at all', () => {
    const parsed = createApprovalFlowSchema.safeParse({
      name: 'No CC field',
      steps: [{ approverType: 'MANAGER' }],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a ROLE watcher missing roleKey', () => {
    const parsed = createApprovalFlowSchema.safeParse({
      name: 'bad',
      steps: [{ approverType: 'MANAGER' }],
      watchers: [{ watcherType: 'ROLE' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a SPECIFIC_USER watcher missing watcherId', () => {
    const parsed = createApprovalFlowSchema.safeParse({
      name: 'bad',
      steps: [{ approverType: 'MANAGER' }],
      watchers: [{ watcherType: 'SPECIFIC_USER' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a watcher of a non-CC type (MANAGER)', () => {
    const parsed = createApprovalFlowSchema.safeParse({
      name: 'bad',
      steps: [{ approverType: 'MANAGER' }],
      watchers: [{ watcherType: 'MANAGER' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('allows update with watchers only', () => {
    const parsed = updateApprovalFlowSchema.safeParse({
      watchers: [{ watcherType: 'ROLE', roleKey: 'hr-staff' }],
    });
    expect(parsed.success).toBe(true);
  });

  it('replaceWatchersSchema accepts an empty list (clear all CC)', () => {
    const parsed = replaceWatchersSchema.safeParse({ watchers: [] });
    expect(parsed.success).toBe(true);
  });
});
