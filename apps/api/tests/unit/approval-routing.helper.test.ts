import { describe, it, expect } from 'vitest';
import {
  resolveFlow,
  resolveApprover,
  buildApprovalSnapshot,
  findNextActiveStep,
  matchesApprover,
  type FlowCandidate,
  type RoutingContext,
  type StepConfig,
  type ApprovalActor,
  type ApprovalTarget,
} from '../../src/domain/leave/approval-routing.helper.js';

function step(overrides: Partial<StepConfig> = {}): StepConfig {
  return {
    stepOrder: 0,
    approverType: 'MANAGER',
    roleKey: null,
    approverId: null,
    ...overrides,
  };
}

function flow(overrides: Partial<FlowCandidate> = {}): FlowCandidate {
  return {
    id: 'flow-1',
    departmentId: null,
    active: true,
    steps: [step()],
    ...overrides,
  };
}

const ctx: RoutingContext = {
  requesterId: 'emp-req',
  directManagerId: 'emp-mgr',
  departmentHeadId: 'emp-head',
};

describe('resolveFlow', () => {
  it('prefers the active flow matching the employee department', () => {
    const deptFlow = flow({ id: 'dept', departmentId: 'dept-A' });
    const defaultFlow = flow({ id: 'default', departmentId: null });
    const chosen = resolveFlow([defaultFlow, deptFlow], 'dept-A');
    expect(chosen?.id).toBe('dept');
  });

  it('falls back to the tenant default when no department flow exists', () => {
    const otherFlow = flow({ id: 'other', departmentId: 'dept-B' });
    const defaultFlow = flow({ id: 'default', departmentId: null });
    const chosen = resolveFlow([otherFlow, defaultFlow], 'dept-A');
    expect(chosen?.id).toBe('default');
  });

  it('falls back to the default for an employee with no department', () => {
    const defaultFlow = flow({ id: 'default', departmentId: null });
    const chosen = resolveFlow([defaultFlow], null);
    expect(chosen?.id).toBe('default');
  });

  it('ignores inactive flows', () => {
    const deptFlow = flow({ id: 'dept', departmentId: 'dept-A', active: false });
    const defaultFlow = flow({ id: 'default', departmentId: null });
    const chosen = resolveFlow([deptFlow, defaultFlow], 'dept-A');
    expect(chosen?.id).toBe('default');
  });

  it('returns null when no applicable flow exists (legacy path)', () => {
    const otherFlow = flow({ id: 'other', departmentId: 'dept-B' });
    expect(resolveFlow([otherFlow], 'dept-A')).toBeNull();
    expect(resolveFlow([], 'dept-A')).toBeNull();
  });

  it('skips flows with no steps', () => {
    const empty = flow({ id: 'empty', departmentId: 'dept-A', steps: [] });
    const defaultFlow = flow({ id: 'default', departmentId: null });
    const chosen = resolveFlow([empty, defaultFlow], 'dept-A');
    expect(chosen?.id).toBe('default');
  });
});

describe('resolveApprover', () => {
  it('resolves MANAGER to the requester direct manager', () => {
    expect(resolveApprover(step({ approverType: 'MANAGER' }), ctx)).toEqual({
      approverId: 'emp-mgr',
      roleKey: null,
    });
  });

  it('resolves DEPARTMENT_HEAD to the department head', () => {
    expect(resolveApprover(step({ approverType: 'DEPARTMENT_HEAD' }), ctx)).toEqual({
      approverId: 'emp-head',
      roleKey: null,
    });
  });

  it('resolves SPECIFIC_USER to the configured approverId', () => {
    expect(
      resolveApprover(step({ approverType: 'SPECIFIC_USER', approverId: 'emp-x' }), ctx),
    ).toEqual({ approverId: 'emp-x', roleKey: null });
  });

  it('resolves ROLE to a roleKey capability with no specific approver', () => {
    expect(resolveApprover(step({ approverType: 'ROLE', roleKey: 'HR_MANAGER' }), ctx)).toEqual({
      approverId: null,
      roleKey: 'HR_MANAGER',
    });
  });

  it('returns null approverId when MANAGER/DEPARTMENT_HEAD are unset', () => {
    const noCtx: RoutingContext = { requesterId: 'r', directManagerId: null, departmentHeadId: null };
    expect(resolveApprover(step({ approverType: 'MANAGER' }), noCtx).approverId).toBeNull();
    expect(resolveApprover(step({ approverType: 'DEPARTMENT_HEAD' }), noCtx).approverId).toBeNull();
  });
});

describe('buildApprovalSnapshot', () => {
  it('resolves each step in order with 1-based stepOrder', () => {
    const f = flow({
      steps: [
        step({ stepOrder: 0, approverType: 'MANAGER' }),
        step({ stepOrder: 1, approverType: 'ROLE', roleKey: 'HR_MANAGER' }),
      ],
    });
    const snap = buildApprovalSnapshot(f, ctx);
    expect(snap).toHaveLength(2);
    expect(snap[0]).toMatchObject({ stepOrder: 1, approverId: 'emp-mgr', skip: false });
    expect(snap[1]).toMatchObject({ stepOrder: 2, roleKey: 'HR_MANAGER', skip: false });
  });

  it('marks an unresolvable MANAGER step as auto-skipped', () => {
    const noMgrCtx: RoutingContext = { ...ctx, directManagerId: null };
    const f = flow({ steps: [step({ approverType: 'MANAGER' })] });
    const snap = buildApprovalSnapshot(f, noMgrCtx);
    expect(snap[0].skip).toBe(true);
    expect(snap[0].skipReason).toBeTruthy();
  });

  it('marks a step resolving to the requester as auto-skipped (no self-approval)', () => {
    const f = flow({ steps: [step({ approverType: 'SPECIFIC_USER', approverId: 'emp-req' })] });
    const snap = buildApprovalSnapshot(f, ctx);
    expect(snap[0].skip).toBe(true);
    expect(snap[0].skipReason).toBeTruthy();
  });

  it('never auto-skips a ROLE step (capability-based)', () => {
    const f = flow({ steps: [step({ approverType: 'ROLE', roleKey: 'HR_MANAGER' })] });
    const snap = buildApprovalSnapshot(f, ctx);
    expect(snap[0].skip).toBe(false);
  });

  it('auto-skips a later step that resolves to the same person as an earlier active step', () => {
    // Manager and department head are the same person (small team): the second
    // step is redundant — don't ask one person to approve twice.
    const sameCtx: RoutingContext = { ...ctx, directManagerId: 'emp-x', departmentHeadId: 'emp-x' };
    const f = flow({
      steps: [
        step({ stepOrder: 0, approverType: 'MANAGER' }),
        step({ stepOrder: 1, approverType: 'DEPARTMENT_HEAD' }),
      ],
    });
    const snap = buildApprovalSnapshot(f, sameCtx);
    expect(snap[0]).toMatchObject({ approverId: 'emp-x', skip: false });
    expect(snap[1]).toMatchObject({ approverId: 'emp-x', skip: true, skipReason: 'DUPLICATE_APPROVER' });
  });

  it('keeps the first occurrence active when a later duplicate is skipped', () => {
    const sameCtx: RoutingContext = { ...ctx, directManagerId: 'emp-x', departmentHeadId: 'emp-x' };
    const f = flow({
      steps: [
        step({ stepOrder: 0, approverType: 'MANAGER' }),
        step({ stepOrder: 1, approverType: 'DEPARTMENT_HEAD' }),
      ],
    });
    const snap = buildApprovalSnapshot(f, sameCtx);
    // After the single active approval, no further active step remains → approved.
    expect(findNextActiveStep(snap, 1)).toBe(1);
    expect(findNextActiveStep(snap, 2)).toBeNull();
  });

  it('does not treat a skipped (NO_APPROVER) step as occupying its approver slot', () => {
    // Step 1 has no manager (skipped); step 2 resolves to a real head — it must
    // stay active, not be mistaken for a duplicate of the empty step.
    const noMgrCtx: RoutingContext = { ...ctx, directManagerId: null, departmentHeadId: 'emp-head' };
    const f = flow({
      steps: [
        step({ stepOrder: 0, approverType: 'MANAGER' }),
        step({ stepOrder: 1, approverType: 'DEPARTMENT_HEAD' }),
      ],
    });
    const snap = buildApprovalSnapshot(f, noMgrCtx);
    expect(snap[0]).toMatchObject({ skip: true, skipReason: 'NO_APPROVER' });
    expect(snap[1]).toMatchObject({ approverId: 'emp-head', skip: false });
  });

  it('does not dedupe ROLE steps (a different person may hold the role)', () => {
    const f = flow({
      steps: [
        step({ stepOrder: 0, approverType: 'SPECIFIC_USER', approverId: 'emp-x' }),
        step({ stepOrder: 1, approverType: 'ROLE', roleKey: 'HR_MANAGER' }),
      ],
    });
    const snap = buildApprovalSnapshot(f, ctx);
    expect(snap[0]).toMatchObject({ approverId: 'emp-x', skip: false });
    expect(snap[1]).toMatchObject({ roleKey: 'HR_MANAGER', skip: false });
  });
});

describe('findNextActiveStep', () => {
  const snapshot = buildApprovalSnapshot(
    flow({
      steps: [
        step({ stepOrder: 0, approverType: 'MANAGER' }), // skip (no mgr below)
        step({ stepOrder: 1, approverType: 'ROLE', roleKey: 'HR_MANAGER' }), // active
        step({ stepOrder: 2, approverType: 'SPECIFIC_USER', approverId: 'emp-x' }), // active
      ],
    }),
    { requesterId: 'emp-req', directManagerId: null, departmentHeadId: null },
  );

  it('skips leading auto-skipped steps from the start', () => {
    expect(findNextActiveStep(snapshot, 1)).toBe(2);
  });

  it('finds the next active step after the current one', () => {
    expect(findNextActiveStep(snapshot, 3)).toBe(3);
    expect(findNextActiveStep(snapshot, 4)).toBeNull();
  });

  it('returns null when every step is skipped (→ immediate approval)', () => {
    const allSkip = buildApprovalSnapshot(
      flow({ steps: [step({ approverType: 'MANAGER' }), step({ stepOrder: 1, approverType: 'DEPARTMENT_HEAD' })] }),
      { requesterId: 'emp-req', directManagerId: null, departmentHeadId: null },
    );
    expect(findNextActiveStep(allSkip, 1)).toBeNull();
  });
});

describe('matchesApprover', () => {
  const actor = (o: Partial<ApprovalActor> = {}): ApprovalActor => ({
    employeeId: 'emp-1',
    roleKey: 'manager',
    isSuperAdmin: false,
    ...o,
  });
  const target = (o: Partial<ApprovalTarget> = {}): ApprovalTarget => ({
    approverType: 'MANAGER',
    roleKey: null,
    approverId: null,
    ...o,
  });

  it('lets SUPER_ADMIN act on any step', () => {
    expect(matchesApprover(target({ approverId: 'someone-else' }), actor({ isSuperAdmin: true }))).toBe(true);
  });

  it('matches a specific-person step only when the actor is that person', () => {
    expect(matchesApprover(target({ approverType: 'MANAGER', approverId: 'emp-1' }), actor())).toBe(true);
    expect(matchesApprover(target({ approverType: 'MANAGER', approverId: 'other' }), actor())).toBe(false);
  });

  it('never matches a specific-person step with no resolved approver', () => {
    expect(matchesApprover(target({ approverType: 'DEPARTMENT_HEAD', approverId: null }), actor())).toBe(false);
  });

  it('matches a ROLE step by capability (role key), ignoring employee id', () => {
    expect(matchesApprover(target({ approverType: 'ROLE', roleKey: 'hr_manager' }), actor({ employeeId: null, roleKey: 'hr_manager' }))).toBe(true);
    expect(matchesApprover(target({ approverType: 'ROLE', roleKey: 'hr_manager' }), actor({ roleKey: 'manager' }))).toBe(false);
  });
});
