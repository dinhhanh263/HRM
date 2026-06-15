import { describe, it, expect, vi, beforeEach } from 'vitest';

const requestRepoMock = {
  findAll: vi.fn(),
  findById: vi.fn(),
  findByIdWithApprovals: vi.fn(),
  findReviewCandidates: vi.fn(),
  findOverlapping: vi.fn(),
  create: vi.fn(),
  createWithApprovals: vi.fn(),
  update: vi.fn(),
  recordDecision: vi.fn(),
  resubmit: vi.fn(),
  aggregateDaysByStatus: vi.fn(),
};
const typeRepoMock = {
  findById: vi.fn(),
};
const balanceServiceMock = {
  getBalances: vi.fn(),
};
const flowRepoMock = {
  findAll: vi.fn(),
};
const employeeRepoMock = {
  findRoutingContext: vi.fn(),
};

vi.mock('../../src/domain/repositories/leave-request.repository.js', () => ({
  leaveRequestRepository: requestRepoMock,
}));
vi.mock('../../src/domain/repositories/leave-type.repository.js', () => ({
  leaveTypeRepository: typeRepoMock,
}));
vi.mock('../../src/domain/repositories/approval-flow.repository.js', () => ({
  approvalFlowRepository: flowRepoMock,
}));
vi.mock('../../src/domain/repositories/employee.repository.js', () => ({
  employeeRepository: employeeRepoMock,
}));
vi.mock('../../src/domain/services/leave-balance.service.js', () => ({
  leaveBalanceService: balanceServiceMock,
}));

const { leaveRequestService } = await import('../../src/domain/services/leave-request.service.js');

function makeStoredRequest(overrides = {}) {
  const now = new Date('2026-06-01T00:00:00.000Z');
  return {
    id: 'req-1',
    tenantId: 'tenant-1',
    employeeId: 'emp-1',
    leaveTypeId: 'lt-1',
    startDate: now,
    endDate: now,
    halfDay: false,
    totalDays: 1,
    reason: null,
    attachmentUrl: null,
    status: 'PENDING',
    reviewedById: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: now,
    updatedAt: now,
    leaveType: { id: 'lt-1', name: 'Annual', code: 'ANNUAL', colorHex: '#3B82F6', paid: true },
    employee: {
      id: 'emp-1',
      fullName: 'Test',
      employeeCode: 'EMP-001',
      avatar: null,
      department: { name: 'Eng' },
    },
    reviewedBy: null,
    ...overrides,
  };
}

const paidType = {
  id: 'lt-1',
  tenantId: 'tenant-1',
  active: true,
  paid: true,
  requiresAttachment: false,
};

describe('leaveRequestService.create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no configured flow → legacy single-step path.
    flowRepoMock.findAll.mockResolvedValue([]);
    employeeRepoMock.findRoutingContext.mockResolvedValue({
      departmentId: 'dept-A',
      managerId: 'mgr-1',
      departmentHeadId: 'head-1',
    });
  });

  it('computes working days and creates a PENDING request when balance allows', async () => {
    typeRepoMock.findById.mockResolvedValue(paidType);
    requestRepoMock.findOverlapping.mockResolvedValue(null);
    balanceServiceMock.getBalances.mockResolvedValue([{ leaveTypeId: 'lt-1', remaining: 10 }]);
    requestRepoMock.create.mockResolvedValue(makeStoredRequest({ totalDays: 5 }));

    const result = await leaveRequestService.create('tenant-1', 'emp-1', {
      leaveTypeId: 'lt-1',
      startDate: '2026-06-01T00:00:00.000Z', // Mon
      endDate: '2026-06-05T00:00:00.000Z', // Fri
    });

    expect(requestRepoMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ totalDays: 5, status: 'PENDING' }),
    );
    expect(result.status).toBe('PENDING');
  });

  it('rejects when requested days exceed remaining balance', async () => {
    typeRepoMock.findById.mockResolvedValue(paidType);
    requestRepoMock.findOverlapping.mockResolvedValue(null);
    balanceServiceMock.getBalances.mockResolvedValue([{ leaveTypeId: 'lt-1', remaining: 2 }]);

    await expect(
      leaveRequestService.create('tenant-1', 'emp-1', {
        leaveTypeId: 'lt-1',
        startDate: '2026-06-01T00:00:00.000Z',
        endDate: '2026-06-05T00:00:00.000Z',
      }),
    ).rejects.toThrow(/Insufficient balance/);
    expect(requestRepoMock.create).not.toHaveBeenCalled();
  });

  it('rejects overlapping requests', async () => {
    typeRepoMock.findById.mockResolvedValue(paidType);
    requestRepoMock.findOverlapping.mockResolvedValue(makeStoredRequest());

    await expect(
      leaveRequestService.create('tenant-1', 'emp-1', {
        leaveTypeId: 'lt-1',
        startDate: '2026-06-01T00:00:00.000Z',
        endDate: '2026-06-01T00:00:00.000Z',
      }),
    ).rejects.toThrow(/overlapping/);
  });

  it('rejects a range with no working days', async () => {
    typeRepoMock.findById.mockResolvedValue(paidType);
    requestRepoMock.findOverlapping.mockResolvedValue(null);

    await expect(
      leaveRequestService.create('tenant-1', 'emp-1', {
        leaveTypeId: 'lt-1',
        startDate: '2026-06-06T00:00:00.000Z', // Sat
        endDate: '2026-06-07T00:00:00.000Z', // Sun
      }),
    ).rejects.toThrow(/no working days/);
  });

  it('requires an attachment when the leave type demands one', async () => {
    typeRepoMock.findById.mockResolvedValue({ ...paidType, requiresAttachment: true });

    await expect(
      leaveRequestService.create('tenant-1', 'emp-1', {
        leaveTypeId: 'lt-1',
        startDate: '2026-06-01T00:00:00.000Z',
        endDate: '2026-06-01T00:00:00.000Z',
      }),
    ).rejects.toThrow(/requires an attachment/);
  });

  function flowStep(overrides = {}) {
    return { stepOrder: 0, approverType: 'MANAGER', roleKey: null, approverId: null, ...overrides };
  }
  function storedFlow(steps: unknown[], overrides = {}) {
    return { id: 'flow-1', departmentId: 'dept-A', active: true, steps, ...overrides };
  }

  const okBalance = () => {
    typeRepoMock.findById.mockResolvedValue(paidType);
    requestRepoMock.findOverlapping.mockResolvedValue(null);
    balanceServiceMock.getBalances.mockResolvedValue([{ leaveTypeId: 'lt-1', remaining: 10 }]);
  };
  const oneDay = { leaveTypeId: 'lt-1', startDate: '2026-06-01T00:00:00.000Z', endDate: '2026-06-01T00:00:00.000Z' };

  it('routes through an applicable flow and snapshots the approval timeline', async () => {
    okBalance();
    flowRepoMock.findAll.mockResolvedValue([
      storedFlow([
        flowStep({ stepOrder: 0, approverType: 'MANAGER' }),
        flowStep({ stepOrder: 1, approverType: 'ROLE', roleKey: 'HR_MANAGER' }),
      ]),
    ]);
    requestRepoMock.createWithApprovals.mockResolvedValue(makeStoredRequest());

    await leaveRequestService.create('tenant-1', 'emp-1', oneDay);

    expect(requestRepoMock.create).not.toHaveBeenCalled();
    const [data, approvals] = requestRepoMock.createWithApprovals.mock.calls[0];
    expect(data).toMatchObject({ flow: { connect: { id: 'flow-1' } }, currentStep: 1 });
    expect(data.status).toBe('PENDING');
    expect(approvals).toHaveLength(2);
    expect(approvals[0]).toMatchObject({ stepOrder: 1, approverId: 'mgr-1', decision: null });
    expect(approvals[1]).toMatchObject({ stepOrder: 2, roleKey: 'HR_MANAGER', decision: null });
  });

  it('auto-skips a leading unresolvable step and lands on the next active step', async () => {
    okBalance();
    employeeRepoMock.findRoutingContext.mockResolvedValue({
      departmentId: 'dept-A',
      managerId: null, // MANAGER step cannot resolve → auto-skip
      departmentHeadId: 'head-1',
    });
    flowRepoMock.findAll.mockResolvedValue([
      storedFlow([
        flowStep({ stepOrder: 0, approverType: 'MANAGER' }),
        flowStep({ stepOrder: 1, approverType: 'DEPARTMENT_HEAD' }),
      ]),
    ]);
    requestRepoMock.createWithApprovals.mockResolvedValue(makeStoredRequest());

    await leaveRequestService.create('tenant-1', 'emp-1', oneDay);

    const [data, approvals] = requestRepoMock.createWithApprovals.mock.calls[0];
    expect(data.currentStep).toBe(2);
    expect(data.status).toBe('PENDING');
    expect(approvals[0]).toMatchObject({ decision: 'AUTO_SKIPPED', note: 'NO_APPROVER' });
    expect(approvals[1]).toMatchObject({ stepOrder: 2, approverId: 'head-1', decision: null });
  });

  it('auto-skips a later step whose approver duplicates an earlier active step', async () => {
    // Real-world case: in a small team the direct manager *is* the department
    // head (same person). A two-step flow must not ask that one person to
    // approve twice — the second step is auto-skipped (DUPLICATE_APPROVER) so a
    // single approval finalizes the request.
    okBalance();
    employeeRepoMock.findRoutingContext.mockResolvedValue({
      departmentId: 'dept-A',
      managerId: 'tuan-1',
      departmentHeadId: 'tuan-1', // same person heads the department
    });
    flowRepoMock.findAll.mockResolvedValue([
      storedFlow([
        flowStep({ stepOrder: 0, approverType: 'MANAGER' }),
        flowStep({ stepOrder: 1, approverType: 'DEPARTMENT_HEAD' }),
      ]),
    ]);
    requestRepoMock.createWithApprovals.mockResolvedValue(makeStoredRequest());

    await leaveRequestService.create('tenant-1', 'emp-1', oneDay);

    const [data, approvals] = requestRepoMock.createWithApprovals.mock.calls[0];
    // Lands on the first (active) step; one approval will finalize.
    expect(data.currentStep).toBe(1);
    expect(data.status).toBe('PENDING');
    expect(approvals[0]).toMatchObject({ stepOrder: 1, approverId: 'tuan-1', decision: null });
    expect(approvals[1]).toMatchObject({
      stepOrder: 2,
      approverId: 'tuan-1',
      decision: 'AUTO_SKIPPED',
      note: 'DUPLICATE_APPROVER',
    });
  });

  it('approves immediately when every step auto-skips', async () => {
    okBalance();
    flowRepoMock.findAll.mockResolvedValue([
      // Single SPECIFIC_USER step resolving to the requester → self-approval skip.
      storedFlow([flowStep({ stepOrder: 0, approverType: 'SPECIFIC_USER', approverId: 'emp-1' })]),
    ]);
    requestRepoMock.createWithApprovals.mockResolvedValue(makeStoredRequest({ status: 'APPROVED' }));

    const result = await leaveRequestService.create('tenant-1', 'emp-1', oneDay);

    const [data, approvals] = requestRepoMock.createWithApprovals.mock.calls[0];
    expect(data.status).toBe('APPROVED');
    expect(data.currentStep).toBe(2); // past the single step
    expect(data.reviewNote).toBe('AUTO_APPROVED');
    expect(approvals[0]).toMatchObject({ decision: 'AUTO_SKIPPED', note: 'SELF_APPROVAL' });
    expect(result.status).toBe('APPROVED');
  });

  it('keeps the legacy single-step path when no flow applies', async () => {
    okBalance();
    flowRepoMock.findAll.mockResolvedValue([]); // no flow configured
    requestRepoMock.create.mockResolvedValue(makeStoredRequest());

    await leaveRequestService.create('tenant-1', 'emp-1', oneDay);

    expect(requestRepoMock.create).toHaveBeenCalled();
    expect(requestRepoMock.createWithApprovals).not.toHaveBeenCalled();
  });
});

function actor(overrides = {}) {
  return { employeeId: 'reviewer-1', roleKey: 'manager', isSuperAdmin: false, ...overrides };
}

describe('leaveRequestService legacy review (flowId=null)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('approves a pending request and stamps the reviewer', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      makeStoredRequest({ employeeId: 'emp-1', flowId: null, approvals: [] }),
    );
    requestRepoMock.update.mockResolvedValue(makeStoredRequest({ status: 'APPROVED' }));

    const result = await leaveRequestService.approve('req-1', 'tenant-1', actor());

    expect(requestRepoMock.update).toHaveBeenCalledWith(
      'req-1',
      'tenant-1',
      expect.objectContaining({ status: 'APPROVED', reviewedBy: { connect: { id: 'reviewer-1' } } }),
    );
    expect(result.status).toBe('APPROVED');
  });

  it('rejects a legacy request to REJECTED (not RETURNED)', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      makeStoredRequest({ employeeId: 'emp-1', flowId: null, approvals: [] }),
    );
    requestRepoMock.update.mockResolvedValue(makeStoredRequest({ status: 'REJECTED' }));

    await leaveRequestService.reject('req-1', 'tenant-1', actor(), 'no');

    expect(requestRepoMock.update).toHaveBeenCalledWith(
      'req-1',
      'tenant-1',
      expect.objectContaining({ status: 'REJECTED' }),
    );
  });

  it('blocks reviewing your own request', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      makeStoredRequest({ employeeId: 'emp-1', flowId: null, approvals: [] }),
    );

    await expect(
      leaveRequestService.approve('req-1', 'tenant-1', actor({ employeeId: 'emp-1' })),
    ).rejects.toThrow(/cannot review your own/i);
  });

  it('blocks reviewing a non-pending request', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      makeStoredRequest({ status: 'APPROVED', flowId: null, approvals: [] }),
    );

    await expect(
      leaveRequestService.reject('req-1', 'tenant-1', actor(), 'no'),
    ).rejects.toThrow(/Only pending/);
  });
});

function approvalRow(overrides = {}) {
  return {
    id: 'appr-1',
    round: 1,
    stepOrder: 1,
    approverType: 'MANAGER',
    roleKey: null,
    approverId: 'mgr-1',
    decision: null,
    decidedById: null,
    decidedAt: null,
    note: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    decidedBy: null,
    ...overrides,
  };
}

function makeFlowRequest(approvals: unknown[], overrides = {}) {
  return makeStoredRequest({ flowId: 'flow-1', currentStep: 1, approvals, ...overrides });
}

describe('leaveRequestService.approve (step-based)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('advances to the next active step when the current approver acts', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      makeFlowRequest([
        approvalRow({ id: 'a1', stepOrder: 1, approverId: 'mgr-1' }),
        approvalRow({ id: 'a2', stepOrder: 2, approverType: 'ROLE', roleKey: 'hr_manager', approverId: null }),
      ]),
    );
    requestRepoMock.recordDecision.mockResolvedValue(makeStoredRequest());

    await leaveRequestService.approve('req-1', 'tenant-1', actor({ employeeId: 'mgr-1' }));

    const [approvalId, approvalData, , , requestData] = requestRepoMock.recordDecision.mock.calls[0];
    expect(approvalId).toBe('a1');
    expect(approvalData).toMatchObject({ decision: 'APPROVED', decidedById: 'mgr-1' });
    expect(requestData).toEqual({ currentStep: 2 });
  });

  it('finalizes APPROVED when the last active step is approved', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      makeFlowRequest(
        [approvalRow({ id: 'a1', stepOrder: 1, approverId: 'mgr-1' })],
        { currentStep: 1 },
      ),
    );
    requestRepoMock.recordDecision.mockResolvedValue(makeStoredRequest({ status: 'APPROVED' }));

    const result = await leaveRequestService.approve('req-1', 'tenant-1', actor({ employeeId: 'mgr-1' }));

    const [, , , , requestData] = requestRepoMock.recordDecision.mock.calls[0];
    expect(requestData).toMatchObject({ status: 'APPROVED', currentStep: 2, reviewNote: 'APPROVED' });
    expect(result.status).toBe('APPROVED');
  });

  it('matches a ROLE step by capability', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      makeFlowRequest([
        approvalRow({ id: 'a1', stepOrder: 1, approverType: 'ROLE', roleKey: 'hr_manager', approverId: null }),
      ]),
    );
    requestRepoMock.recordDecision.mockResolvedValue(makeStoredRequest({ status: 'APPROVED' }));

    await leaveRequestService.approve('req-1', 'tenant-1', actor({ employeeId: 'x', roleKey: 'hr_manager' }));

    expect(requestRepoMock.recordDecision).toHaveBeenCalled();
  });

  it('forbids a non-approver from acting on the current step', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      makeFlowRequest([approvalRow({ id: 'a1', stepOrder: 1, approverId: 'mgr-1' })]),
    );

    await expect(
      leaveRequestService.approve('req-1', 'tenant-1', actor({ employeeId: 'someone-else' })),
    ).rejects.toThrow(/not the approver/i);
    expect(requestRepoMock.recordDecision).not.toHaveBeenCalled();
  });

  it('lets SUPER_ADMIN approve any step', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      makeFlowRequest([approvalRow({ id: 'a1', stepOrder: 1, approverId: 'mgr-1' })]),
    );
    requestRepoMock.recordDecision.mockResolvedValue(makeStoredRequest({ status: 'APPROVED' }));

    await leaveRequestService.approve('req-1', 'tenant-1', actor({ employeeId: null, isSuperAdmin: true }));

    expect(requestRepoMock.recordDecision).toHaveBeenCalled();
  });
});

describe('leaveRequestService.reject (step-based → RETURNED)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the request and records the step note', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      makeFlowRequest([approvalRow({ id: 'a1', stepOrder: 1, approverId: 'mgr-1' })]),
    );
    requestRepoMock.recordDecision.mockResolvedValue(makeStoredRequest({ status: 'RETURNED' }));

    const result = await leaveRequestService.reject(
      'req-1', 'tenant-1', actor({ employeeId: 'mgr-1' }), 'Please fix the dates',
    );

    const [approvalId, approvalData, , , requestData] = requestRepoMock.recordDecision.mock.calls[0];
    expect(approvalId).toBe('a1');
    expect(approvalData).toMatchObject({ decision: 'RETURNED', note: 'Please fix the dates' });
    expect(requestData).toMatchObject({ status: 'RETURNED', reviewNote: 'Please fix the dates' });
    expect(result.status).toBe('RETURNED');
  });

  it('requires a note when returning', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      makeFlowRequest([approvalRow({ id: 'a1', stepOrder: 1, approverId: 'mgr-1' })]),
    );

    await expect(
      leaveRequestService.reject('req-1', 'tenant-1', actor({ employeeId: 'mgr-1' }), '  '),
    ).rejects.toThrow(/note is required/i);
    expect(requestRepoMock.recordDecision).not.toHaveBeenCalled();
  });
});

describe('leaveRequestService.resubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    typeRepoMock.findById.mockResolvedValue(paidType);
    requestRepoMock.findOverlapping.mockResolvedValue(null);
    balanceServiceMock.getBalances.mockResolvedValue([{ leaveTypeId: 'lt-1', remaining: 10 }]);
    employeeRepoMock.findRoutingContext.mockResolvedValue({
      departmentId: 'dept-A',
      managerId: 'mgr-1',
      departmentHeadId: 'head-1',
    });
    flowRepoMock.findAll.mockResolvedValue([
      { id: 'flow-1', departmentId: 'dept-A', active: true, steps: [
        { stepOrder: 0, approverType: 'MANAGER', roleKey: null, approverId: null },
      ] },
    ]);
  });

  const oneDay = { leaveTypeId: 'lt-1', startDate: '2026-06-01T00:00:00.000Z', endDate: '2026-06-01T00:00:00.000Z' };

  it('re-opens a RETURNED request with a fresh round (maxRound+1) and resets to PENDING', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      makeFlowRequest(
        [approvalRow({ id: 'a1', stepOrder: 1, decision: 'RETURNED', round: 1, note: 'fix' })],
        { status: 'RETURNED', employeeId: 'emp-1', reviewedById: 'mgr-1' },
      ),
    );
    requestRepoMock.resubmit.mockResolvedValue(makeStoredRequest({ status: 'PENDING' }));

    const result = await leaveRequestService.resubmit('req-1', 'tenant-1', 'emp-1', oneDay);

    const [id, tenantId, requestData, approvals] = requestRepoMock.resubmit.mock.calls[0];
    expect(id).toBe('req-1');
    expect(tenantId).toBe('tenant-1');
    expect(requestData).toMatchObject({
      status: 'PENDING',
      currentStep: 1,
      reviewedAt: null,
      reviewNote: null,
      reviewedBy: { disconnect: true },
      flow: { connect: { id: 'flow-1' } },
    });
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({ round: 2, stepOrder: 1, approverId: 'mgr-1', decision: null });
    expect(result.status).toBe('PENDING');
  });

  it('forbids resubmitting someone else\'s request', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      makeFlowRequest([approvalRow({ decision: 'RETURNED' })], { status: 'RETURNED', employeeId: 'emp-1' }),
    );

    await expect(
      leaveRequestService.resubmit('req-1', 'tenant-1', 'other', oneDay),
    ).rejects.toThrow(/only resubmit your own/i);
    expect(requestRepoMock.resubmit).not.toHaveBeenCalled();
  });

  it('rejects resubmitting a request that is not RETURNED', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      makeFlowRequest([approvalRow()], { status: 'PENDING', employeeId: 'emp-1' }),
    );

    await expect(
      leaveRequestService.resubmit('req-1', 'tenant-1', 'emp-1', oneDay),
    ).rejects.toThrow(/Only returned/i);
    expect(requestRepoMock.resubmit).not.toHaveBeenCalled();
  });

  it('re-validates overlap on resubmit', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      makeFlowRequest([approvalRow({ decision: 'RETURNED' })], { status: 'RETURNED', employeeId: 'emp-1' }),
    );
    requestRepoMock.findOverlapping.mockResolvedValue(makeStoredRequest());

    await expect(
      leaveRequestService.resubmit('req-1', 'tenant-1', 'emp-1', oneDay),
    ).rejects.toThrow(/overlapping/);
    expect(requestRepoMock.resubmit).not.toHaveBeenCalled();
  });
});

describe('leaveRequestService.listReview', () => {
  beforeEach(() => vi.clearAllMocks());

  const paging = { page: 1, limit: 20 };

  it('keeps only requests where the actor is the current-step approver', async () => {
    requestRepoMock.findReviewCandidates.mockResolvedValue([
      // mine now (current step 1, approverId mgr-1) → kept
      makeFlowRequest([approvalRow({ id: 'a1', stepOrder: 1, approverId: 'mgr-1' })], { id: 'r-keep' }),
      // not my turn yet (current step is 1 but I only approve step 2) → dropped
      makeFlowRequest(
        [
          approvalRow({ id: 'b1', stepOrder: 1, approverId: 'other' }),
          approvalRow({ id: 'b2', stepOrder: 2, approverId: 'mgr-1' }),
        ],
        { id: 'r-future', currentStep: 1 },
      ),
    ]);

    const result = await leaveRequestService.listReview(
      'tenant-1',
      actor({ employeeId: 'mgr-1', roleKey: null }),
      { scope: 'review' },
      paging,
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('r-keep');
    expect(result.pagination.total).toBe(1);
  });

  it('includes legacy single-step requests for any capability-holder', async () => {
    requestRepoMock.findReviewCandidates.mockResolvedValue([
      makeStoredRequest({ id: 'legacy-1', flowId: null, approvals: [], status: 'PENDING' }),
    ]);

    const result = await leaveRequestService.listReview(
      'tenant-1',
      actor({ employeeId: 'whoever' }),
      { scope: 'review' },
      paging,
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('legacy-1');
  });

  it('matches a ROLE current step by the actor capability', async () => {
    requestRepoMock.findReviewCandidates.mockResolvedValue([
      makeFlowRequest(
        [approvalRow({ id: 'a1', stepOrder: 1, approverType: 'ROLE', roleKey: 'hr_manager', approverId: null })],
        { id: 'r-role' },
      ),
    ]);

    const result = await leaveRequestService.listReview(
      'tenant-1',
      actor({ employeeId: 'x', roleKey: 'hr_manager' }),
      { scope: 'review' },
      paging,
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('r-role');
  });
});

describe('leaveRequestService.getById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the request with its approval timeline', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      makeFlowRequest([approvalRow({ id: 'a1', stepOrder: 1, approverId: 'mgr-1' })]),
    );

    const result = await leaveRequestService.getById('req-1', 'tenant-1');

    expect(result.id).toBe('req-1');
    expect(result.approvals).toHaveLength(1);
  });

  it('throws NotFound when the request does not exist', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(null);

    await expect(leaveRequestService.getById('nope', 'tenant-1')).rejects.toThrow(/not found/i);
  });
});

describe('leaveRequestService.cancel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cancels your own pending request', async () => {
    requestRepoMock.findById.mockResolvedValue(makeStoredRequest({ employeeId: 'emp-1' }));
    requestRepoMock.update.mockResolvedValue(makeStoredRequest({ status: 'CANCELLED' }));

    const result = await leaveRequestService.cancel('req-1', 'tenant-1', 'emp-1');

    expect(result.status).toBe('CANCELLED');
  });

  it('forbids cancelling someone else\'s request', async () => {
    requestRepoMock.findById.mockResolvedValue(makeStoredRequest({ employeeId: 'emp-1' }));

    await expect(
      leaveRequestService.cancel('req-1', 'tenant-1', 'other'),
    ).rejects.toThrow(/only cancel your own/i);
  });
});
