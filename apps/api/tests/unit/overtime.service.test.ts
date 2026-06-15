import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMock = {
  findById: vi.fn(),
  findByIdWithApprovals: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  createWithApprovals: vi.fn(),
  recordDecision: vi.fn(),
  resubmit: vi.fn(),
  findReviewCandidates: vi.fn(),
  update: vi.fn(),
  sumApprovedHours: vi.fn(),
};

const holidayRepoMock = {
  findByYear: vi.fn(),
};

const policyServiceMock = {
  getPolicy: vi.fn(),
};

const approvalFlowRepoMock = {
  findAll: vi.fn(),
};

const employeeRepoMock = {
  findRoutingContext: vi.fn(),
};

vi.mock('../../src/domain/repositories/overtime.repository.js', () => ({
  overtimeRepository: repoMock,
  overtimeWithEmployee: {},
}));

vi.mock('../../src/domain/repositories/holiday.repository.js', () => ({
  holidayRepository: holidayRepoMock,
}));

vi.mock('../../src/domain/services/timesheet-policy.service.js', () => ({
  timesheetPolicyService: policyServiceMock,
}));

vi.mock('../../src/domain/repositories/approval-flow.repository.js', () => ({
  approvalFlowRepository: approvalFlowRepoMock,
}));

vi.mock('../../src/domain/repositories/employee.repository.js', () => ({
  employeeRepository: employeeRepoMock,
}));

const { overtimeService } = await import('../../src/domain/services/overtime.service.js');

// A reviewer actor with no flow involvement; the legacy single-step branch
// (flowId=null) only checks self-approval, so the actor identity is enough.
const REVIEWER: { employeeId: string; roleKey: string | null; isSuperAdmin: boolean } = {
  employeeId: 'mgr-1',
  roleKey: null,
  isSuperAdmin: false,
};

function makeOt(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-06-02T10:00:00.000Z');
  return {
    id: 'ot-1',
    tenantId: 'tenant-1',
    employeeId: 'emp-1',
    workDate: new Date('2026-06-06T00:00:00.000Z'),
    hours: 3,
    night: false,
    category: 'OT_WEEKEND',
    reason: null,
    status: 'PENDING',
    multiplier: null,
    flowId: null,
    currentStep: 0,
    approvals: [],
    reviewedById: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const POLICY = { workdays: [1, 2, 3, 4, 5] };

describe('overtimeService.submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    policyServiceMock.getPolicy.mockResolvedValue(POLICY);
    holidayRepoMock.findByYear.mockResolvedValue([]);
    // No OT flow configured → submit() takes the legacy single-step path.
    employeeRepoMock.findRoutingContext.mockResolvedValue(null);
    approvalFlowRepoMock.findAll.mockResolvedValue([]);
    repoMock.create.mockImplementation((data: Record<string, unknown>) =>
      Promise.resolve(makeOt(data)),
    );
  });

  it('should derive OT_WEEKEND for a Saturday and create a PENDING request', async () => {
    const now = new Date('2026-06-08T10:00:00.000Z');
    // 2026-06-06 is a Saturday
    const result = await overtimeService.submit(
      'tenant-1',
      'emp-1',
      { workDate: '2026-06-06', hours: 3, reason: 'Release' },
      now,
    );

    const arg = repoMock.create.mock.calls[0][0];
    expect(arg.category).toBe('OT_WEEKEND');
    expect(arg.status).toBe('PENDING');
    expect(arg.multiplier).toBeUndefined();
    expect(arg.hours).toBe(3);
    expect(arg.workDate.toISOString()).toBe('2026-06-06T00:00:00.000Z');
    expect(result.category).toBe('OT_WEEKEND');
  });

  it('should derive OT_HOLIDAY when the work date matches a holiday', async () => {
    holidayRepoMock.findByYear.mockResolvedValue([
      { date: new Date('2026-09-02T00:00:00.000Z'), recurring: false },
    ]);
    repoMock.create.mockImplementation((data: Record<string, unknown>) =>
      Promise.resolve(makeOt(data)),
    );
    const now = new Date('2026-09-03T10:00:00.000Z');

    const result = await overtimeService.submit(
      'tenant-1',
      'emp-1',
      { workDate: '2026-09-02', hours: 4 },
      now,
    );

    expect(repoMock.create.mock.calls[0][0].category).toBe('OT_HOLIDAY');
    expect(result.category).toBe('OT_HOLIDAY');
  });

  it('should reject non-positive hours', async () => {
    const now = new Date('2026-06-07T10:00:00.000Z');
    await expect(
      overtimeService.submit('tenant-1', 'emp-1', { workDate: '2026-06-06', hours: 0 }, now),
    ).rejects.toThrow(/greater than 0/);
    expect(repoMock.create).not.toHaveBeenCalled();
  });

  it('should reject a future work date', async () => {
    const now = new Date('2026-06-02T10:00:00.000Z');
    await expect(
      overtimeService.submit('tenant-1', 'emp-1', { workDate: '2999-01-01', hours: 2 }, now),
    ).rejects.toThrow(/future/);
    expect(repoMock.create).not.toHaveBeenCalled();
  });
});

describe('overtimeService list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoMock.list.mockResolvedValue({ rows: [makeOt()], total: 1 });
  });

  it('listMine should scope to the caller and paginate', async () => {
    const result = await overtimeService.listMine(
      'tenant-1',
      'emp-1',
      { month: '2026-06', page: 1, limit: 20 },
    );

    const arg = repoMock.list.mock.calls[0][1];
    expect(arg.employeeIds).toEqual(['emp-1']);
    expect(arg.start.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(arg.end.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(result.data).toHaveLength(1);
  });

  it('listForReview should pass null employeeIds for tenant-wide (HR) scope', async () => {
    await overtimeService.listForReview('tenant-1', null, { status: 'PENDING' });

    const arg = repoMock.list.mock.calls[0][1];
    expect(arg.employeeIds).toBeNull();
    expect(arg.status).toBe('PENDING');
  });

  it('listForReview should restrict to provided report ids (manager scope)', async () => {
    await overtimeService.listForReview('tenant-1', ['emp-2', 'emp-3'], {});

    expect(repoMock.list.mock.calls[0][1].employeeIds).toEqual(['emp-2', 'emp-3']);
  });
});

const MULTIPLIER_POLICY = {
  workdays: [1, 2, 3, 4, 5],
  otWeekday: 1.5,
  otWeekend: 2.0,
  otHoliday: 3.0,
  nightExtra: 0.3,
  nightOtExtra: 0.2,
};

describe('overtimeService.approve', () => {
  const now = new Date('2026-06-08T10:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
    policyServiceMock.getPolicy.mockResolvedValue(MULTIPLIER_POLICY);
    repoMock.sumApprovedHours.mockResolvedValue(0);
    repoMock.update.mockImplementation((id: string, _tenantId: string, data: Record<string, unknown>) =>
      Promise.resolve(makeOt({ id, status: 'APPROVED', ...data })),
    );
  });

  it('should snapshot the multiplier and mark APPROVED, stamping the reviewer', async () => {
    repoMock.findByIdWithApprovals.mockResolvedValue(
      makeOt({ category: 'OT_WEEKEND', night: false, hours: 3 }),
    );

    const result = await overtimeService.approve('tenant-1', REVIEWER, 'ot-1', now);

    const [id, , data] = repoMock.update.mock.calls[0];
    expect(id).toBe('ot-1');
    expect(data.status).toBe('APPROVED');
    expect(data.multiplier).toBe(2.0); // weekend day rate
    expect(data.reviewedBy).toEqual({ connect: { id: 'mgr-1' } });
    expect(data.reviewedAt).toBe(now);
    expect(result.warnings).toEqual([]);
  });

  it('should snapshot the elevated night multiplier (weekend night = 2.7)', async () => {
    repoMock.findByIdWithApprovals.mockResolvedValue(
      makeOt({ category: 'OT_WEEKEND', night: true, hours: 3 }),
    );

    await overtimeService.approve('tenant-1', REVIEWER, 'ot-1', now);

    expect(repoMock.update.mock.calls[0][2].multiplier).toBe(2.7);
  });

  it('should return a monthly cap warning when approved hours push past 40h', async () => {
    // 38h already approved this month + 4h request = 42h > 40h cap.
    repoMock.sumApprovedHours.mockImplementation((_t, _e, start: Date) =>
      // monthly range starts on the 1st; yearly range on Jan 1.
      Promise.resolve(start.getUTCMonth() === 5 ? 38 : 38),
    );
    repoMock.findByIdWithApprovals.mockResolvedValue(makeOt({ category: 'OT_WEEKDAY', hours: 4 }));

    const result = await overtimeService.approve('tenant-1', REVIEWER, 'ot-1', now);

    expect(result.warnings).toContainEqual({ scope: 'month', limit: 40, total: 42 });
    // Approval still succeeds — advisory only.
    expect(repoMock.update).toHaveBeenCalled();
  });

  it('should reject approving a non-pending request', async () => {
    repoMock.findByIdWithApprovals.mockResolvedValue(makeOt({ status: 'APPROVED' }));

    await expect(overtimeService.approve('tenant-1', REVIEWER, 'ot-1', now)).rejects.toThrow(
      /pending/i,
    );
    expect(repoMock.update).not.toHaveBeenCalled();
  });

  it('should 404 when the request is not in the tenant', async () => {
    repoMock.findByIdWithApprovals.mockResolvedValue(null);

    await expect(overtimeService.approve('tenant-1', REVIEWER, 'missing', now)).rejects.toThrow();
    expect(repoMock.update).not.toHaveBeenCalled();
  });
});

describe('overtimeService.reject', () => {
  const now = new Date('2026-06-08T10:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
    repoMock.update.mockImplementation((id: string, _tenantId: string, data: Record<string, unknown>) =>
      Promise.resolve(makeOt({ id, status: 'REJECTED', ...data })),
    );
  });

  it('should mark REJECTED with the reviewer note (legacy single-step)', async () => {
    repoMock.findByIdWithApprovals.mockResolvedValue(makeOt());

    const result = await overtimeService.reject('tenant-1', REVIEWER, 'ot-1', 'Not justified', now);

    const data = repoMock.update.mock.calls[0][2];
    expect(data.status).toBe('REJECTED');
    expect(data.reviewNote).toBe('Not justified');
    expect(data.reviewedBy).toEqual({ connect: { id: 'mgr-1' } });
    expect(data.multiplier).toBeUndefined();
    expect(result.status).toBe('REJECTED');
  });

  it('should reject a non-pending request', async () => {
    repoMock.findByIdWithApprovals.mockResolvedValue(makeOt({ status: 'CANCELLED' }));

    await expect(
      overtimeService.reject('tenant-1', REVIEWER, 'ot-1', 'late', now),
    ).rejects.toThrow(/pending/i);
  });
});

describe('overtimeService.cancel', () => {
  const now = new Date('2026-06-08T10:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
    repoMock.update.mockImplementation((id: string, _tenantId: string, data: Record<string, unknown>) =>
      Promise.resolve(makeOt({ id, status: 'CANCELLED', ...data })),
    );
  });

  it('should let the owner cancel their own pending request', async () => {
    repoMock.findById.mockResolvedValue(makeOt({ employeeId: 'emp-1' }));

    const result = await overtimeService.cancel('tenant-1', 'emp-1', 'ot-1', now);

    expect(repoMock.update.mock.calls[0][2].status).toBe('CANCELLED');
    expect(result.status).toBe('CANCELLED');
  });

  it('should forbid cancelling someone else’s request', async () => {
    repoMock.findById.mockResolvedValue(makeOt({ employeeId: 'emp-99' }));

    await expect(overtimeService.cancel('tenant-1', 'emp-1', 'ot-1', now)).rejects.toThrow();
    expect(repoMock.update).not.toHaveBeenCalled();
  });

  it('should not cancel an already-approved request', async () => {
    repoMock.findById.mockResolvedValue(makeOt({ employeeId: 'emp-1', status: 'APPROVED' }));

    await expect(overtimeService.cancel('tenant-1', 'emp-1', 'ot-1', now)).rejects.toThrow(
      /pending/i,
    );
    expect(repoMock.update).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi-step approval flow (SPEC-023)
// ─────────────────────────────────────────────────────────────────────────────

// A configured 2-step OT flow: step 0 = the requester's direct MANAGER,
// step 1 = anyone holding the hr_manager ROLE. stepOrder is 0-based in config;
// the runtime snapshot is 1-based.
const TWO_STEP_FLOW = {
  id: 'flow-1',
  departmentId: null,
  active: true,
  steps: [
    { stepOrder: 0, approverType: 'MANAGER', roleKey: null, approverId: null },
    { stepOrder: 1, approverType: 'ROLE', roleKey: 'hr_manager', approverId: null },
  ],
};

// Requester emp-1 reports to manager mgr-1; dept head is head-1.
const ROUTING_CTX = { departmentId: 'dept-1', managerId: 'mgr-1', departmentHeadId: 'head-1' };

// The manager (step 1) and an HR-role holder (step 2) acting on the flow.
const MANAGER_ACTOR = { employeeId: 'mgr-1', roleKey: null, isSuperAdmin: false };
const HR_ACTOR = { employeeId: 'hr-1', roleKey: 'hr_manager', isSuperAdmin: false };

// A flow-routed request mid-flight: round 1, awaiting the manager at step 1.
function makeFlowOt(overrides: Record<string, unknown> = {}) {
  return makeOt({
    flowId: 'flow-1',
    currentStep: 1,
    approvals: [
      { id: 'ap-1', round: 1, stepOrder: 1, approverType: 'MANAGER', roleKey: null, approverId: 'mgr-1', decision: null },
      { id: 'ap-2', round: 1, stepOrder: 2, approverType: 'ROLE', roleKey: 'hr_manager', approverId: null, decision: null },
    ],
    ...overrides,
  });
}

describe('overtimeService.submit (flow-routed)', () => {
  const now = new Date('2026-06-08T10:00:00.000Z'); // 2026-06-06 is a Saturday

  beforeEach(() => {
    vi.clearAllMocks();
    policyServiceMock.getPolicy.mockResolvedValue(MULTIPLIER_POLICY);
    holidayRepoMock.findByYear.mockResolvedValue([]);
    employeeRepoMock.findRoutingContext.mockResolvedValue(ROUTING_CTX);
    approvalFlowRepoMock.findAll.mockResolvedValue([TWO_STEP_FLOW]);
    repoMock.createWithApprovals.mockImplementation((data: Record<string, unknown>) =>
      Promise.resolve(makeOt({ ...data, flowId: 'flow-1', approvals: [] })),
    );
  });

  it('should snapshot both steps PENDING and start at step 1, not legacy create', async () => {
    await overtimeService.submit(
      'tenant-1',
      'emp-1',
      { workDate: '2026-06-06', hours: 3 },
      now,
    );

    expect(repoMock.create).not.toHaveBeenCalled();
    const [data, approvals] = repoMock.createWithApprovals.mock.calls[0];
    expect(data.flow).toEqual({ connect: { id: 'flow-1' } });
    expect(data.currentStep).toBe(1);
    expect(data.status).toBe('PENDING');
    expect(data.multiplier).toBeUndefined();
    // Both steps snapshotted as active (no decision yet) for round 1.
    expect(approvals).toHaveLength(2);
    expect(approvals.map((a: { stepOrder: number }) => a.stepOrder)).toEqual([1, 2]);
    expect(approvals.every((a: { decision: unknown }) => a.decision === null)).toBe(true);
    expect(approvals.every((a: { round: number }) => a.round === 1)).toBe(true);
  });

  it('should be born APPROVED with a snapshotted multiplier when every step auto-skips', async () => {
    // Manager unresolved (no direct manager) → step skips NO_APPROVER; the lone
    // step is the manager step, so the whole flow auto-approves on submit.
    employeeRepoMock.findRoutingContext.mockResolvedValue({
      departmentId: 'dept-1',
      managerId: null,
      departmentHeadId: 'head-1',
    });
    approvalFlowRepoMock.findAll.mockResolvedValue([
      {
        id: 'flow-1',
        departmentId: null,
        active: true,
        steps: [{ stepOrder: 0, approverType: 'MANAGER', roleKey: null, approverId: null }],
      },
    ]);

    await overtimeService.submit('tenant-1', 'emp-1', { workDate: '2026-06-06', hours: 3 }, now);

    const [data, approvals] = repoMock.createWithApprovals.mock.calls[0];
    expect(data.status).toBe('APPROVED');
    expect(data.multiplier).toBe(2.0); // OT_WEEKEND day rate
    expect(data.reviewNote).toBe('AUTO_APPROVED');
    expect(data.currentStep).toBe(2); // past the single step (length + 1)
    expect(approvals[0].decision).toBe('AUTO_SKIPPED');
    expect(approvals[0].note).toBe('NO_APPROVER');
  });
});

describe('overtimeService.approve (flow-routed)', () => {
  const now = new Date('2026-06-08T10:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
    policyServiceMock.getPolicy.mockResolvedValue(MULTIPLIER_POLICY);
    repoMock.sumApprovedHours.mockResolvedValue(0);
    repoMock.recordDecision.mockImplementation(
      (
        _decisionId: string,
        _decisionData: Record<string, unknown>,
        requestId: string,
        _tenantId: string,
        requestData: Record<string, unknown>,
      ) => Promise.resolve(makeOt({ id: requestId, flowId: 'flow-1', approvals: [], ...requestData })),
    );
  });

  it('should advance to the next step without settling pay (no multiplier yet)', async () => {
    repoMock.findByIdWithApprovals.mockResolvedValue(
      makeFlowOt({ category: 'OT_WEEKEND', currentStep: 1 }),
    );

    const result = await overtimeService.approve('tenant-1', MANAGER_ACTOR, 'ot-1', now);

    const [decisionId, decisionData, , , requestData] = repoMock.recordDecision.mock.calls[0];
    expect(decisionId).toBe('ap-1'); // the manager's step
    expect(decisionData.decision).toBe('APPROVED');
    expect(requestData.currentStep).toBe(2); // advanced to the HR step
    expect(requestData.status).toBeUndefined(); // still pending overall
    expect(requestData.multiplier).toBeUndefined(); // not settled until final step
    expect(result.warnings).toEqual([]);
  });

  it('should settle pay and mark APPROVED at the final step', async () => {
    repoMock.findByIdWithApprovals.mockResolvedValue(
      makeFlowOt({
        category: 'OT_WEEKEND',
        currentStep: 2,
        approvals: [
          { id: 'ap-1', round: 1, stepOrder: 1, approverType: 'MANAGER', roleKey: null, approverId: 'mgr-1', decision: 'APPROVED' },
          { id: 'ap-2', round: 1, stepOrder: 2, approverType: 'ROLE', roleKey: 'hr_manager', approverId: null, decision: null },
        ],
      }),
    );

    const result = await overtimeService.approve('tenant-1', HR_ACTOR, 'ot-1', now);

    const [decisionId, , , , requestData] = repoMock.recordDecision.mock.calls[0];
    expect(decisionId).toBe('ap-2'); // the HR step
    expect(requestData.status).toBe('APPROVED');
    expect(requestData.multiplier).toBe(2.0); // settled at the final step
    expect(requestData.currentStep).toBe(3); // past the last step
    expect(requestData.reviewNote).toBe('APPROVED');
    expect(result.warnings).toEqual([]);
  });

  it('should forbid a non-current approver from acting on the step', async () => {
    repoMock.findByIdWithApprovals.mockResolvedValue(
      makeFlowOt({ currentStep: 1 }),
    );
    const intruder = { employeeId: 'someone-else', roleKey: null, isSuperAdmin: false };

    await expect(
      overtimeService.approve('tenant-1', intruder, 'ot-1', now),
    ).rejects.toThrow(/not the approver/i);
    expect(repoMock.recordDecision).not.toHaveBeenCalled();
  });
});

describe('overtimeService.reject (flow-routed → RETURNED)', () => {
  const now = new Date('2026-06-08T10:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
    repoMock.recordDecision.mockImplementation(
      (
        _decisionId: string,
        _decisionData: Record<string, unknown>,
        requestId: string,
        _tenantId: string,
        requestData: Record<string, unknown>,
      ) => Promise.resolve(makeOt({ id: requestId, flowId: 'flow-1', approvals: [], ...requestData })),
    );
  });

  it('should RETURN the request (not terminal REJECTED) with the mandatory note', async () => {
    repoMock.findByIdWithApprovals.mockResolvedValue(makeFlowOt({ currentStep: 1 }));

    const result = await overtimeService.reject(
      'tenant-1',
      MANAGER_ACTOR,
      'ot-1',
      'Please attach the project ticket',
      now,
    );

    const [decisionId, decisionData, , , requestData] = repoMock.recordDecision.mock.calls[0];
    expect(decisionId).toBe('ap-1');
    expect(decisionData.decision).toBe('RETURNED');
    expect(requestData.status).toBe('RETURNED');
    expect(requestData.reviewNote).toBe('Please attach the project ticket');
    expect(result.status).toBe('RETURNED');
  });

  it('should require a note when returning', async () => {
    repoMock.findByIdWithApprovals.mockResolvedValue(makeFlowOt({ currentStep: 1 }));

    await expect(
      overtimeService.reject('tenant-1', MANAGER_ACTOR, 'ot-1', '   ', now),
    ).rejects.toThrow(/note is required/i);
    expect(repoMock.recordDecision).not.toHaveBeenCalled();
  });

  it('should forbid a non-current approver from returning', async () => {
    repoMock.findByIdWithApprovals.mockResolvedValue(makeFlowOt({ currentStep: 1 }));
    const intruder = { employeeId: 'someone-else', roleKey: null, isSuperAdmin: false };

    await expect(
      overtimeService.reject('tenant-1', intruder, 'ot-1', 'no', now),
    ).rejects.toThrow(/not the approver/i);
    expect(repoMock.recordDecision).not.toHaveBeenCalled();
  });
});

describe('overtimeService.resubmit', () => {
  const now = new Date('2026-06-08T10:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
    policyServiceMock.getPolicy.mockResolvedValue(MULTIPLIER_POLICY);
    holidayRepoMock.findByYear.mockResolvedValue([]);
    employeeRepoMock.findRoutingContext.mockResolvedValue(ROUTING_CTX);
    approvalFlowRepoMock.findAll.mockResolvedValue([TWO_STEP_FLOW]);
    repoMock.resubmit.mockImplementation(
      (id: string, _tenantId: string, data: Record<string, unknown>) =>
        Promise.resolve(makeOt({ id, flowId: 'flow-1', approvals: [], ...data })),
    );
  });

  it('should open a fresh round (round+1) preserving earlier history', async () => {
    repoMock.findByIdWithApprovals.mockResolvedValue(
      makeFlowOt({
        status: 'RETURNED',
        employeeId: 'emp-1',
        currentStep: 1,
        approvals: [
          { id: 'ap-1', round: 1, stepOrder: 1, approverType: 'MANAGER', roleKey: null, approverId: 'mgr-1', decision: 'RETURNED' },
          { id: 'ap-2', round: 1, stepOrder: 2, approverType: 'ROLE', roleKey: 'hr_manager', approverId: null, decision: 'AUTO_SKIPPED' },
        ],
      }),
    );

    await overtimeService.resubmit(
      'tenant-1',
      'emp-1',
      'ot-1',
      { workDate: '2026-06-06', hours: 4 },
      now,
    );

    const [id, , data, approvals] = repoMock.resubmit.mock.calls[0];
    expect(id).toBe('ot-1');
    expect(data.status).toBe('PENDING');
    expect(data.currentStep).toBe(1);
    expect(data.flow).toEqual({ connect: { id: 'flow-1' } });
    // New round is the previous max (1) + 1.
    expect(approvals.every((a: { round: number }) => a.round === 2)).toBe(true);
    expect(approvals).toHaveLength(2);
  });

  it('should refuse to resubmit a request that is not RETURNED', async () => {
    repoMock.findByIdWithApprovals.mockResolvedValue(
      makeFlowOt({ status: 'PENDING', employeeId: 'emp-1' }),
    );

    await expect(
      overtimeService.resubmit('tenant-1', 'emp-1', 'ot-1', { workDate: '2026-06-06', hours: 4 }, now),
    ).rejects.toThrow(/returned/i);
    expect(repoMock.resubmit).not.toHaveBeenCalled();
  });

  it('should forbid resubmitting someone else’s request', async () => {
    repoMock.findByIdWithApprovals.mockResolvedValue(
      makeFlowOt({ status: 'RETURNED', employeeId: 'emp-1' }),
    );

    await expect(
      overtimeService.resubmit('tenant-1', 'emp-99', 'ot-1', { workDate: '2026-06-06', hours: 4 }, now),
    ).rejects.toThrow();
    expect(repoMock.resubmit).not.toHaveBeenCalled();
  });
});
