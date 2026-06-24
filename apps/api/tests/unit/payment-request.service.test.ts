import { describe, it, expect, vi, beforeEach } from 'vitest';

const requestRepoMock = {
  findAll: vi.fn(),
  findById: vi.fn(),
  findByIdWithApprovals: vi.fn(),
  findReviewCandidates: vi.fn(),
  create: vi.fn(),
  createWithApprovals: vi.fn(),
  update: vi.fn(),
  recordDecision: vi.fn(),
  resubmit: vi.fn(),
};
const flowRepoMock = { findAll: vi.fn() };
const employeeRepoMock = { findRoutingContext: vi.fn() };

vi.mock('../../src/domain/repositories/payment-request.repository.js', () => ({
  paymentRequestRepository: requestRepoMock,
}));
vi.mock('../../src/domain/repositories/approval-flow.repository.js', () => ({
  approvalFlowRepository: flowRepoMock,
}));
vi.mock('../../src/domain/repositories/employee.repository.js', () => ({
  employeeRepository: employeeRepoMock,
}));

const { paymentRequestService, aggregatePaymentStats } = await import('../../src/domain/services/payment-request.service.js');

// Seeded PAYMENT flow: MANAGER → ROLE(super_admin).
const PAYMENT_FLOW = {
  id: 'flow-pay',
  departmentId: null,
  active: true,
  steps: [
    { stepOrder: 0, approverType: 'MANAGER', roleKey: null, approverId: null },
    { stepOrder: 1, approverType: 'ROLE', roleKey: 'super_admin', approverId: null },
  ],
};

function storedRequest(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-06-23T00:00:00.000Z');
  return {
    id: 'pr-1',
    tenantId: 'tenant-1',
    employeeId: 'emp-1',
    type: 'REIMBURSEMENT',
    title: 'Taxi',
    description: null,
    amount: 250000,
    currency: 'VND',
    status: 'PENDING',
    expenseDate: now,
    category: null,
    neededByDate: null,
    vendorName: null,
    invoiceNumber: null,
    dueDate: null,
    flowId: 'flow-pay',
    currentStep: 1,
    reviewedById: null,
    reviewedAt: null,
    reviewNote: null,
    paidById: null,
    paidAt: null,
    paymentNote: null,
    createdAt: now,
    updatedAt: now,
    employee: { id: 'emp-1', fullName: 'Nhân Viên', employeeCode: 'EMP-001', avatar: null, department: { name: 'Eng' } },
    reviewedBy: null,
    paidBy: null,
    approvals: [],
    attachments: [],
    ...overrides,
  };
}

const baseInput = {
  type: 'REIMBURSEMENT' as const,
  title: 'Taxi',
  amount: 250000,
  expenseDate: '2026-06-20T00:00:00.000Z',
};

describe('paymentRequestService.create — routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flowRepoMock.findAll.mockResolvedValue([PAYMENT_FLOW]);
    requestRepoMock.createWithApprovals.mockResolvedValue(storedRequest());
  });

  it('nhân viên thường có quản lý → PENDING, currentStep=1, 2 approval rows chờ', async () => {
    employeeRepoMock.findRoutingContext.mockResolvedValue({
      departmentId: null,
      managerId: 'mgr-1',
      departmentHeadId: null,
    });

    await paymentRequestService.create(
      'tenant-1',
      'emp-1',
      { isSuperAdmin: false, roleKey: 'employee' },
      baseInput,
    );

    expect(requestRepoMock.createWithApprovals).toHaveBeenCalledTimes(1);
    const [data, approvals] = requestRepoMock.createWithApprovals.mock.calls[0];
    expect(data.currentStep).toBe(1);
    expect(data.status).toBe('PENDING'); // không auto-approve
    expect(approvals).toHaveLength(2);
    expect(approvals[0]).toMatchObject({ stepOrder: 1, approverType: 'MANAGER', approverId: 'mgr-1', decision: null });
    expect(approvals[1]).toMatchObject({ stepOrder: 2, approverType: 'ROLE', roleKey: 'super_admin', decision: null });
  });

  it('Founder (super_admin) tự nộp, không có quản lý → tự APPROVED, mọi bước auto-skip', async () => {
    employeeRepoMock.findRoutingContext.mockResolvedValue({
      departmentId: null,
      managerId: null,
      departmentHeadId: null,
    });

    await paymentRequestService.create(
      'tenant-1',
      'founder-emp',
      { isSuperAdmin: true, roleKey: 'super_admin' },
      baseInput,
    );

    const [data, approvals] = requestRepoMock.createWithApprovals.mock.calls[0];
    expect(data.status).toBe('APPROVED');
    expect(data.currentStep).toBe(3); // past last step
    expect(approvals.every((a: { decision: string }) => a.decision === 'AUTO_SKIPPED')).toBe(true);
    // bước ROLE bị skip với lý do SELF_APPROVAL (Founder không tự duyệt)
    expect(approvals[1]).toMatchObject({ approverType: 'ROLE', decision: 'AUTO_SKIPPED', note: 'SELF_APPROVAL' });
  });

  it('nhân viên thường KHÔNG có quản lý → bỏ qua bước MANAGER, dừng ở bước Founder (currentStep=2)', async () => {
    employeeRepoMock.findRoutingContext.mockResolvedValue({
      departmentId: null,
      managerId: null,
      departmentHeadId: null,
    });

    await paymentRequestService.create(
      'tenant-1',
      'emp-1',
      { isSuperAdmin: false, roleKey: 'employee' },
      baseInput,
    );

    const [data, approvals] = requestRepoMock.createWithApprovals.mock.calls[0];
    expect(data.status).toBe('PENDING');
    expect(data.currentStep).toBe(2);
    expect(approvals[0]).toMatchObject({ approverType: 'MANAGER', decision: 'AUTO_SKIPPED', note: 'NO_APPROVER' });
    expect(approvals[1]).toMatchObject({ approverType: 'ROLE', decision: null }); // chờ Founder
  });

  it('REIMBURSEMENT thiếu expenseDate → BadRequest, không tạo đơn', async () => {
    await expect(
      paymentRequestService.create(
        'tenant-1',
        'emp-1',
        { isSuperAdmin: false, roleKey: 'employee' },
        { type: 'REIMBURSEMENT', title: 'X', amount: 1000 },
      ),
    ).rejects.toThrow();
    expect(requestRepoMock.createWithApprovals).not.toHaveBeenCalled();
  });

  it('amount = 0 → BadRequest', async () => {
    await expect(
      paymentRequestService.create(
        'tenant-1',
        'emp-1',
        { isSuperAdmin: false, roleKey: 'employee' },
        { ...baseInput, amount: 0 },
      ),
    ).rejects.toThrow();
  });
});

function requestWithApprovals(overrides: Record<string, unknown> = {}, approvals: unknown[] = []) {
  return { ...storedRequest({ approvals, ...overrides }) };
}

const TWO_STEP = [
  { id: 'ap-1', round: 1, stepOrder: 1, approverType: 'MANAGER', roleKey: null, approverId: 'mgr-1', decision: null },
  { id: 'ap-2', round: 1, stepOrder: 2, approverType: 'ROLE', roleKey: 'super_admin', approverId: null, decision: null },
];

const managerActor = { employeeId: 'mgr-1', roleKey: 'manager', isSuperAdmin: false };
const founderActor = { employeeId: 'founder-1', roleKey: 'super_admin', isSuperAdmin: true };

describe('paymentRequestService — decisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestRepoMock.recordDecision.mockResolvedValue(storedRequest());
    requestRepoMock.update.mockResolvedValue(storedRequest());
    requestRepoMock.resubmit.mockResolvedValue(storedRequest());
  });

  it('manager duyệt bước 1 → ghi APPROVED, currentStep tiến tới 2 (đơn vẫn PENDING)', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      requestWithApprovals({ currentStep: 1 }, TWO_STEP),
    );
    await paymentRequestService.approve('pr-1', 'tenant-1', managerActor);

    const [, approvalData, , , requestData] = requestRepoMock.recordDecision.mock.calls[0];
    expect(approvalData.decision).toBe('APPROVED');
    expect(requestData.currentStep).toBe(2);
    expect(requestData.status).toBeUndefined(); // chưa finalize
  });

  it('Founder duyệt bước cuối → APPROVED', async () => {
    const approvals = [
      { ...TWO_STEP[0], decision: 'APPROVED', decidedById: 'mgr-1' },
      { ...TWO_STEP[1] },
    ];
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      requestWithApprovals({ currentStep: 2 }, approvals),
    );
    await paymentRequestService.approve('pr-1', 'tenant-1', founderActor);

    const [, approvalData, , , requestData] = requestRepoMock.recordDecision.mock.calls[0];
    expect(approvalData.decision).toBe('APPROVED');
    expect(requestData.status).toBe('APPROVED');
  });

  it("respond 'reject' → REJECTED terminal + note", async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      requestWithApprovals({ currentStep: 1 }, TWO_STEP),
    );
    await paymentRequestService.respond('pr-1', 'tenant-1', managerActor, 'reject', 'Không hợp lệ');

    const [, approvalData, , , requestData] = requestRepoMock.recordDecision.mock.calls[0];
    expect(approvalData.decision).toBe('REJECTED');
    expect(requestData.status).toBe('REJECTED');
    expect(requestData.reviewNote).toBe('Không hợp lệ');
  });

  it("respond 'return' → RETURNED (sửa lại được)", async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      requestWithApprovals({ currentStep: 1 }, TWO_STEP),
    );
    await paymentRequestService.respond('pr-1', 'tenant-1', managerActor, 'return', 'Bổ sung hoá đơn');
    const [, approvalData, , , requestData] = requestRepoMock.recordDecision.mock.calls[0];
    expect(approvalData.decision).toBe('RETURNED');
    expect(requestData.status).toBe('RETURNED');
  });

  it('return/reject thiếu note → BadRequest', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      requestWithApprovals({ currentStep: 1 }, TWO_STEP),
    );
    await expect(
      paymentRequestService.respond('pr-1', 'tenant-1', managerActor, 'return', '  '),
    ).rejects.toThrow();
  });

  it('không phải người duyệt bước hiện tại → Forbidden', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      requestWithApprovals({ currentStep: 1 }, TWO_STEP),
    );
    const stranger = { employeeId: 'someone-else', roleKey: 'manager', isSuperAdmin: false };
    await expect(paymentRequestService.approve('pr-1', 'tenant-1', stranger)).rejects.toThrow();
    expect(requestRepoMock.recordDecision).not.toHaveBeenCalled();
  });

  it('không được tự duyệt đơn của chính mình', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      requestWithApprovals({ currentStep: 1, employeeId: 'mgr-1' }, TWO_STEP),
    );
    await expect(paymentRequestService.approve('pr-1', 'tenant-1', managerActor)).rejects.toThrow();
  });

  it('không hành động trên đơn không PENDING', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      requestWithApprovals({ currentStep: 1, status: 'APPROVED' }, TWO_STEP),
    );
    await expect(paymentRequestService.approve('pr-1', 'tenant-1', managerActor)).rejects.toThrow();
  });

  it('markPaid: APPROVED → PAID (ghi paidBy + paidAt)', async () => {
    requestRepoMock.findById.mockResolvedValue(storedRequest({ status: 'APPROVED' }));
    await paymentRequestService.markPaid('pr-1', 'tenant-1', founderActor, 'CK 23/06');
    const [, , requestData] = requestRepoMock.update.mock.calls[0];
    expect(requestData.status).toBe('PAID');
    expect(requestData.paymentNote).toBe('CK 23/06');
    expect(requestData.paidBy).toEqual({ connect: { id: 'founder-1' } });
  });

  it('markPaid: đơn chưa APPROVED → BadRequest', async () => {
    requestRepoMock.findById.mockResolvedValue(storedRequest({ status: 'PENDING' }));
    await expect(paymentRequestService.markPaid('pr-1', 'tenant-1', founderActor)).rejects.toThrow();
    expect(requestRepoMock.update).not.toHaveBeenCalled();
  });

  it('cancel: chủ đơn huỷ đơn PENDING → CANCELLED', async () => {
    requestRepoMock.findById.mockResolvedValue(storedRequest({ status: 'PENDING', employeeId: 'emp-1' }));
    await paymentRequestService.cancel('pr-1', 'tenant-1', 'emp-1');
    const [, , requestData] = requestRepoMock.update.mock.calls[0];
    expect(requestData.status).toBe('CANCELLED');
  });

  it('cancel: không phải chủ đơn → Forbidden', async () => {
    requestRepoMock.findById.mockResolvedValue(storedRequest({ status: 'PENDING', employeeId: 'emp-1' }));
    await expect(paymentRequestService.cancel('pr-1', 'tenant-1', 'other')).rejects.toThrow();
  });

  it('resubmit: chỉ đơn RETURNED, mở round mới (round+1)', async () => {
    flowRepoMock.findAll.mockResolvedValue([PAYMENT_FLOW]);
    employeeRepoMock.findRoutingContext.mockResolvedValue({ departmentId: null, managerId: 'mgr-1', departmentHeadId: null });
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      requestWithApprovals({ status: 'RETURNED', employeeId: 'emp-1' }, [
        { ...TWO_STEP[0], round: 1, decision: 'RETURNED', decidedById: 'mgr-1' },
      ]),
    );
    await paymentRequestService.resubmit(
      'pr-1', 'tenant-1', 'emp-1', { isSuperAdmin: false, roleKey: 'employee' }, baseInput,
    );
    const [, , , approvals] = requestRepoMock.resubmit.mock.calls[0];
    expect(approvals.every((a: { round: number }) => a.round === 2)).toBe(true);
  });

  it('resubmit: đơn không RETURNED → BadRequest', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      requestWithApprovals({ status: 'PENDING', employeeId: 'emp-1' }, TWO_STEP),
    );
    await expect(
      paymentRequestService.resubmit('pr-1', 'tenant-1', 'emp-1', { isSuperAdmin: false, roleKey: 'employee' }, baseInput),
    ).rejects.toThrow();
  });
});

describe('aggregatePaymentStats', () => {
  it('buckets by month + totals by type/status, grand/paid/pending', () => {
    const rows = [
      { createdAt: new Date('2026-01-10T00:00:00Z'), amount: 100000, type: 'REIMBURSEMENT', status: 'PAID' },
      { createdAt: new Date('2026-01-20T00:00:00Z'), amount: 50000, type: 'REIMBURSEMENT', status: 'PENDING' },
      { createdAt: new Date('2026-03-05T00:00:00Z'), amount: 200000, type: 'VENDOR_PAYMENT', status: 'APPROVED' },
    ];
    const s = aggregatePaymentStats(rows, 2026);

    expect(s.year).toBe(2026);
    expect(s.months).toHaveLength(12);
    expect(s.months[0]).toMatchObject({ month: 1, total: '150000', count: 2 }); // Jan
    expect(s.months[2]).toMatchObject({ month: 3, total: '200000', count: 1 }); // Mar
    expect(s.months[1]).toMatchObject({ month: 2, total: '0', count: 0 }); // Feb empty
    expect(s.grandTotal).toBe('350000');
    expect(s.grandCount).toBe(3);
    expect(s.paidTotal).toBe('100000');
    expect(s.pendingTotal).toBe('50000');
    expect(s.byType.find((g) => g.key === 'REIMBURSEMENT')).toMatchObject({ total: '150000', count: 2 });
    expect(s.byStatus.find((g) => g.key === 'APPROVED')).toMatchObject({ total: '200000', count: 1 });
  });

  it('empty year → 12 zero months, zero totals', () => {
    const s = aggregatePaymentStats([], 2025);
    expect(s.months).toHaveLength(12);
    expect(s.months.every((m) => m.total === '0' && m.count === 0)).toBe(true);
    expect(s.grandTotal).toBe('0');
    expect(s.grandCount).toBe(0);
  });
});

describe('paymentRequestService.list — scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestRepoMock.findAll.mockResolvedValue({
      data: [storedRequest()],
      total: 1,
      totalAmount: '250000',
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it("scope 'mine' lọc theo employeeId của người gọi", async () => {
    await paymentRequestService.list('tenant-1', 'emp-1', { scope: 'mine' }, { page: 1, limit: 20 });
    const [, filters] = requestRepoMock.findAll.mock.calls[0];
    expect(filters.employeeId).toBe('emp-1');
  });

  it("scope 'all' KHÔNG lọc theo employeeId, trả totalAmount", async () => {
    const result = await paymentRequestService.list('tenant-1', '', { scope: 'all' }, { page: 1, limit: 20 });
    const [, filters] = requestRepoMock.findAll.mock.calls[0];
    expect(filters.employeeId).toBeUndefined();
    expect(result.totalAmount).toBe('250000');
    expect(result.items).toHaveLength(1);
  });
});
