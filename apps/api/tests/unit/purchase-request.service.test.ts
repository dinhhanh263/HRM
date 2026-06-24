import { describe, it, expect, vi, beforeEach } from 'vitest';

const requestRepoMock = {
  findAll: vi.fn(),
  findById: vi.fn(),
  findByIdWithApprovals: vi.fn(),
  findReviewCandidates: vi.fn(),
  createWithApprovals: vi.fn(),
  update: vi.fn(),
  recordDecision: vi.fn(),
  resubmit: vi.fn(),
  countTodayForTenant: vi.fn(),
};
const flowRepoMock = { findAll: vi.fn() };
const employeeRepoMock = { findRoutingContext: vi.fn() };

vi.mock('../../src/domain/repositories/purchase-request.repository.js', () => ({
  purchaseRequestRepository: requestRepoMock,
}));
vi.mock('../../src/domain/repositories/approval-flow.repository.js', () => ({
  approvalFlowRepository: flowRepoMock,
}));
vi.mock('../../src/domain/repositories/employee.repository.js', () => ({
  employeeRepository: employeeRepoMock,
}));

const { purchaseRequestService, computeTotals, generatePurchaseCode, aggregatePurchaseStats } =
  await import('../../src/domain/services/purchase-request.service.js');

// Seeded PURCHASE flow: MANAGER → ROLE(super_admin).
const PURCHASE_FLOW = {
  id: 'flow-pur',
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
    id: 'pur-1',
    tenantId: 'tenant-1',
    employeeId: 'emp-1',
    code: 'PR-20260623-001',
    title: 'Mua gỗ teak',
    description: null,
    vendorName: 'Công ty Gỗ ABC',
    expectedDeliveryDate: null,
    currency: 'VND',
    status: 'PENDING',
    subtotal: 18954000,
    taxAmount: 1516320,
    totalAmount: 20470320,
    flowId: 'flow-pur',
    currentStep: 1,
    reviewedById: null,
    reviewedAt: null,
    reviewNote: null,
    orderedById: null,
    orderedAt: null,
    orderNote: null,
    createdAt: now,
    updatedAt: now,
    employee: { id: 'emp-1', fullName: 'Nhân Viên', employeeCode: 'EMP-001', avatar: null, department: { name: 'Eng' } },
    reviewedBy: null,
    orderedBy: null,
    items: [],
    approvals: [],
    attachments: [],
    ...overrides,
  };
}

const baseInput = {
  title: 'Mua gỗ teak',
  vendorName: 'Công ty Gỗ ABC',
  items: [
    { productName: 'Gỗ teak', unit: 'm3', quantity: 2, unitPrice: 9477000, taxRate: 8 },
  ],
};

// ── computeTotals — per-line VAT + rounding + multi-line ──────────────────────
describe('computeTotals', () => {
  it('1 dòng: lineSubtotal = qty×price, lineTax = round2(subtotal×rate/100)', () => {
    const r = computeTotals([{ productName: 'X', quantity: 2, unitPrice: 100000, taxRate: 8 }]);
    expect(r.lines[0].lineSubtotal).toBe(200000);
    expect(r.lines[0].lineTax).toBe(16000);
    expect(r.lines[0].lineTotal).toBe(216000);
    expect(r.subtotal).toBe(200000);
    expect(r.taxAmount).toBe(16000);
    expect(r.totalAmount).toBe(216000);
  });

  it('khớp số liệu file mẫu PR: subtotal 18.954.000 / VAT 1.516.320 / tổng 20.470.320', () => {
    const r = computeTotals([
      { productName: 'Gỗ teak', quantity: 2, unitPrice: 9477000, taxRate: 8 },
    ]);
    expect(r.subtotal).toBe(18954000);
    expect(r.taxAmount).toBe(1516320);
    expect(r.totalAmount).toBe(20470320);
  });

  it('nhiều dòng + VAT khác nhau: tổng = Σ từng dòng', () => {
    const r = computeTotals([
      { productName: 'A', quantity: 3, unitPrice: 100000, taxRate: 8 }, // 300000 + 24000
      { productName: 'B', quantity: 1, unitPrice: 500000, taxRate: 10 }, // 500000 + 50000
      { productName: 'C', quantity: 2, unitPrice: 250000, taxRate: 0 }, // 500000 + 0
    ]);
    expect(r.subtotal).toBe(1300000);
    expect(r.taxAmount).toBe(74000);
    expect(r.totalAmount).toBe(1374000);
    expect(r.lines).toHaveLength(3);
    expect(r.lines[1].lineNo).toBe(2);
  });

  it('rounding 2dp ở mỗi dòng (số lẻ kg)', () => {
    const r = computeTotals([
      { productName: 'Cát', quantity: 1.333, unitPrice: 12345, taxRate: 8 },
    ]);
    // 1.333 × 12345 = 16455.885 → round2 16455.89
    expect(r.lines[0].lineSubtotal).toBe(16455.89);
    // 16455.89 × 8 / 100 = 1316.4712 → round2 1316.47
    expect(r.lines[0].lineTax).toBe(1316.47);
    expect(r.lines[0].lineTotal).toBe(17772.36);
  });

  it('taxRate mặc định 8 khi không truyền', () => {
    const r = computeTotals([{ productName: 'X', quantity: 1, unitPrice: 1000 }]);
    expect(r.lines[0].lineTax).toBe(80);
  });
});

// ── generatePurchaseCode — daily sequence ─────────────────────────────────────
describe('generatePurchaseCode', () => {
  it('format PR-yyyyMMdd-NNN với seq 1-based, 3 chữ số', () => {
    const d = new Date('2026-06-23T08:30:00.000Z');
    expect(generatePurchaseCode(d, 0)) /* count today = 0 → seq 1 */.toBe('PR-20260623-001');
    expect(generatePurchaseCode(d, 4)).toBe('PR-20260623-005');
    expect(generatePurchaseCode(d, 41)).toBe('PR-20260623-042');
  });

  it('pad ngày/tháng 2 chữ số', () => {
    const d = new Date('2026-01-05T00:00:00.000Z');
    expect(generatePurchaseCode(d, 0)).toBe('PR-20260105-001');
  });
});

// ── create routing (mirror payment) ──────────────────────────────────────────
describe('purchaseRequestService.create — routing + totals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flowRepoMock.findAll.mockResolvedValue([PURCHASE_FLOW]);
    requestRepoMock.countTodayForTenant.mockResolvedValue(0);
    requestRepoMock.createWithApprovals.mockResolvedValue(storedRequest());
  });

  it('nhân viên thường có quản lý → PENDING, currentStep=1, 2 approval rows chờ, code sinh, totals tính server', async () => {
    employeeRepoMock.findRoutingContext.mockResolvedValue({
      departmentId: null, managerId: 'mgr-1', departmentHeadId: null,
    });

    await purchaseRequestService.create(
      'tenant-1', 'emp-1', { isSuperAdmin: false, roleKey: 'employee' }, baseInput,
    );

    expect(requestRepoMock.createWithApprovals).toHaveBeenCalledTimes(1);
    const [data, approvals] = requestRepoMock.createWithApprovals.mock.calls[0];
    expect(data.currentStep).toBe(1);
    expect(data.status).toBe('PENDING');
    expect(data.code).toMatch(/^PR-\d{8}-\d{3}$/);
    // server tính tổng từ items (2 × 9.477.000 = 18.954.000 + VAT 8%)
    expect(Number(data.subtotal)).toBe(18954000);
    expect(Number(data.taxAmount)).toBe(1516320);
    expect(Number(data.totalAmount)).toBe(20470320);
    expect(data.items.create).toHaveLength(1);
    expect(approvals).toHaveLength(2);
    expect(approvals[0]).toMatchObject({ stepOrder: 1, approverType: 'MANAGER', approverId: 'mgr-1', decision: null });
    expect(approvals[1]).toMatchObject({ stepOrder: 2, approverType: 'ROLE', roleKey: 'super_admin', decision: null });
  });

  it('Founder tự nộp → tự APPROVED, mọi bước auto-skip (ROLE skip = SELF_APPROVAL)', async () => {
    employeeRepoMock.findRoutingContext.mockResolvedValue({
      departmentId: null, managerId: null, departmentHeadId: null,
    });

    await purchaseRequestService.create(
      'tenant-1', 'founder-emp', { isSuperAdmin: true, roleKey: 'super_admin' }, baseInput,
    );

    const [data, approvals] = requestRepoMock.createWithApprovals.mock.calls[0];
    expect(data.status).toBe('APPROVED');
    expect(data.currentStep).toBe(3);
    expect(approvals.every((a: { decision: string }) => a.decision === 'AUTO_SKIPPED')).toBe(true);
    expect(approvals[1]).toMatchObject({ approverType: 'ROLE', decision: 'AUTO_SKIPPED', note: 'SELF_APPROVAL' });
  });

  it('NV không có quản lý → bỏ qua bước MANAGER, dừng ở Founder (currentStep=2)', async () => {
    employeeRepoMock.findRoutingContext.mockResolvedValue({
      departmentId: null, managerId: null, departmentHeadId: null,
    });
    await purchaseRequestService.create(
      'tenant-1', 'emp-1', { isSuperAdmin: false, roleKey: 'employee' }, baseInput,
    );
    const [data, approvals] = requestRepoMock.createWithApprovals.mock.calls[0];
    expect(data.status).toBe('PENDING');
    expect(data.currentStep).toBe(2);
    expect(approvals[0]).toMatchObject({ approverType: 'MANAGER', decision: 'AUTO_SKIPPED', note: 'NO_APPROVER' });
    expect(approvals[1]).toMatchObject({ approverType: 'ROLE', decision: null });
  });

  it('không có dòng hàng → BadRequest, không tạo', async () => {
    await expect(
      purchaseRequestService.create('tenant-1', 'emp-1', { isSuperAdmin: false, roleKey: 'employee' }, { ...baseInput, items: [] }),
    ).rejects.toThrow();
    expect(requestRepoMock.createWithApprovals).not.toHaveBeenCalled();
  });

  it('thiếu vendorName → BadRequest', async () => {
    await expect(
      purchaseRequestService.create('tenant-1', 'emp-1', { isSuperAdmin: false, roleKey: 'employee' }, { ...baseInput, vendorName: '  ' }),
    ).rejects.toThrow();
  });

  it('quantity <= 0 → BadRequest', async () => {
    await expect(
      purchaseRequestService.create('tenant-1', 'emp-1', { isSuperAdmin: false, roleKey: 'employee' }, {
        ...baseInput, items: [{ productName: 'X', quantity: 0, unitPrice: 1000, taxRate: 8 }],
      }),
    ).rejects.toThrow();
  });

  it('unitPrice < 0 → BadRequest', async () => {
    await expect(
      purchaseRequestService.create('tenant-1', 'emp-1', { isSuperAdmin: false, roleKey: 'employee' }, {
        ...baseInput, items: [{ productName: 'X', quantity: 1, unitPrice: -1, taxRate: 8 }],
      }),
    ).rejects.toThrow();
  });
});

// ── decisions (mirror payment) ────────────────────────────────────────────────
const TWO_STEP = [
  { id: 'ap-1', round: 1, stepOrder: 1, approverType: 'MANAGER', roleKey: null, approverId: 'mgr-1', decision: null },
  { id: 'ap-2', round: 1, stepOrder: 2, approverType: 'ROLE', roleKey: 'super_admin', approverId: null, decision: null },
];
const managerActor = { employeeId: 'mgr-1', roleKey: 'manager', isSuperAdmin: false };
const founderActor = { employeeId: 'founder-1', roleKey: 'super_admin', isSuperAdmin: true };

function requestWithApprovals(overrides: Record<string, unknown> = {}, approvals: unknown[] = []) {
  return { ...storedRequest({ approvals, ...overrides }) };
}

describe('purchaseRequestService — decisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestRepoMock.recordDecision.mockResolvedValue(storedRequest());
    requestRepoMock.update.mockResolvedValue(storedRequest());
    requestRepoMock.resubmit.mockResolvedValue(storedRequest());
  });

  it('manager duyệt bước 1 → ghi APPROVED, currentStep→2 (vẫn PENDING)', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(requestWithApprovals({ currentStep: 1 }, TWO_STEP));
    await purchaseRequestService.approve('pur-1', 'tenant-1', managerActor);
    const [, approvalData, , , requestData] = requestRepoMock.recordDecision.mock.calls[0];
    expect(approvalData.decision).toBe('APPROVED');
    expect(requestData.currentStep).toBe(2);
    expect(requestData.status).toBeUndefined();
  });

  it('Founder duyệt bước cuối → APPROVED', async () => {
    const approvals = [{ ...TWO_STEP[0], decision: 'APPROVED', decidedById: 'mgr-1' }, { ...TWO_STEP[1] }];
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(requestWithApprovals({ currentStep: 2 }, approvals));
    await purchaseRequestService.approve('pur-1', 'tenant-1', founderActor);
    const [, approvalData, , , requestData] = requestRepoMock.recordDecision.mock.calls[0];
    expect(approvalData.decision).toBe('APPROVED');
    expect(requestData.status).toBe('APPROVED');
  });

  it("respond 'reject' → REJECTED terminal + note", async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(requestWithApprovals({ currentStep: 1 }, TWO_STEP));
    await purchaseRequestService.respond('pur-1', 'tenant-1', managerActor, 'reject', 'Giá cao');
    const [, approvalData, , , requestData] = requestRepoMock.recordDecision.mock.calls[0];
    expect(approvalData.decision).toBe('REJECTED');
    expect(requestData.status).toBe('REJECTED');
    expect(requestData.reviewNote).toBe('Giá cao');
  });

  it("respond 'return' → RETURNED (sửa lại được)", async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(requestWithApprovals({ currentStep: 1 }, TWO_STEP));
    await purchaseRequestService.respond('pur-1', 'tenant-1', managerActor, 'return', 'Bổ sung báo giá');
    const [, approvalData, , , requestData] = requestRepoMock.recordDecision.mock.calls[0];
    expect(approvalData.decision).toBe('RETURNED');
    expect(requestData.status).toBe('RETURNED');
  });

  it('return/reject thiếu note → BadRequest', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(requestWithApprovals({ currentStep: 1 }, TWO_STEP));
    await expect(
      purchaseRequestService.respond('pur-1', 'tenant-1', managerActor, 'return', '  '),
    ).rejects.toThrow();
  });

  it('không phải người duyệt bước hiện tại → Forbidden', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(requestWithApprovals({ currentStep: 1 }, TWO_STEP));
    const stranger = { employeeId: 'someone-else', roleKey: 'manager', isSuperAdmin: false };
    await expect(purchaseRequestService.approve('pur-1', 'tenant-1', stranger)).rejects.toThrow();
    expect(requestRepoMock.recordDecision).not.toHaveBeenCalled();
  });

  it('không được tự duyệt phiếu của chính mình', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(requestWithApprovals({ currentStep: 1, employeeId: 'mgr-1' }, TWO_STEP));
    await expect(purchaseRequestService.approve('pur-1', 'tenant-1', managerActor)).rejects.toThrow();
  });

  it('không hành động trên phiếu không PENDING', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(requestWithApprovals({ currentStep: 1, status: 'APPROVED' }, TWO_STEP));
    await expect(purchaseRequestService.approve('pur-1', 'tenant-1', managerActor)).rejects.toThrow();
  });

  it('markOrdered: APPROVED → ORDERED (ghi orderedBy + orderedAt + orderNote)', async () => {
    requestRepoMock.findById.mockResolvedValue(storedRequest({ status: 'APPROVED' }));
    await purchaseRequestService.markOrdered('pur-1', 'tenant-1', founderActor, 'PO-2026-07');
    const [, , requestData] = requestRepoMock.update.mock.calls[0];
    expect(requestData.status).toBe('ORDERED');
    expect(requestData.orderNote).toBe('PO-2026-07');
    expect(requestData.orderedBy).toEqual({ connect: { id: 'founder-1' } });
  });

  it('markOrdered: phiếu chưa APPROVED → BadRequest', async () => {
    requestRepoMock.findById.mockResolvedValue(storedRequest({ status: 'PENDING' }));
    await expect(purchaseRequestService.markOrdered('pur-1', 'tenant-1', founderActor)).rejects.toThrow();
    expect(requestRepoMock.update).not.toHaveBeenCalled();
  });

  it('cancel: chủ phiếu huỷ phiếu PENDING → CANCELLED', async () => {
    requestRepoMock.findById.mockResolvedValue(storedRequest({ status: 'PENDING', employeeId: 'emp-1' }));
    await purchaseRequestService.cancel('pur-1', 'tenant-1', 'emp-1');
    const [, , requestData] = requestRepoMock.update.mock.calls[0];
    expect(requestData.status).toBe('CANCELLED');
  });

  it('cancel: không phải chủ phiếu → Forbidden', async () => {
    requestRepoMock.findById.mockResolvedValue(storedRequest({ status: 'PENDING', employeeId: 'emp-1' }));
    await expect(purchaseRequestService.cancel('pur-1', 'tenant-1', 'other')).rejects.toThrow();
  });

  it('resubmit: chỉ phiếu RETURNED, mở round mới (round+1), replace items + tính lại totals', async () => {
    flowRepoMock.findAll.mockResolvedValue([PURCHASE_FLOW]);
    employeeRepoMock.findRoutingContext.mockResolvedValue({ departmentId: null, managerId: 'mgr-1', departmentHeadId: null });
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(
      requestWithApprovals({ status: 'RETURNED', employeeId: 'emp-1' }, [
        { ...TWO_STEP[0], round: 1, decision: 'RETURNED', decidedById: 'mgr-1' },
      ]),
    );
    await purchaseRequestService.resubmit('pur-1', 'tenant-1', 'emp-1', { isSuperAdmin: false, roleKey: 'employee' }, baseInput);
    // resubmit(requestId, tenantId, requestData, items, approvals)
    const [, , requestData, , approvals] = requestRepoMock.resubmit.mock.calls[0];
    expect(approvals.every((a: { round: number }) => a.round === 2)).toBe(true);
    expect(Number(requestData.subtotal)).toBe(18954000);
  });

  it('resubmit: phiếu không RETURNED → BadRequest', async () => {
    requestRepoMock.findByIdWithApprovals.mockResolvedValue(requestWithApprovals({ status: 'PENDING', employeeId: 'emp-1' }, TWO_STEP));
    await expect(
      purchaseRequestService.resubmit('pur-1', 'tenant-1', 'emp-1', { isSuperAdmin: false, roleKey: 'employee' }, baseInput),
    ).rejects.toThrow();
  });
});

// ── aggregatePurchaseStats — month/status/department/vendor ────────────────────
describe('aggregatePurchaseStats', () => {
  it('buckets by month + totals by status/department/vendor, grand/ordered/pending', () => {
    const rows = [
      { createdAt: new Date('2026-01-10T00:00:00Z'), totalAmount: 100000, status: 'ORDERED', departmentName: 'Eng', vendorName: 'NCC A' },
      { createdAt: new Date('2026-01-20T00:00:00Z'), totalAmount: 50000, status: 'PENDING', departmentName: 'Eng', vendorName: 'NCC B' },
      { createdAt: new Date('2026-03-05T00:00:00Z'), totalAmount: 200000, status: 'APPROVED', departmentName: 'Sales', vendorName: 'NCC A' },
    ];
    const s = aggregatePurchaseStats(rows, 2026);

    expect(s.year).toBe(2026);
    expect(s.months).toHaveLength(12);
    expect(s.months[0]).toMatchObject({ month: 1, total: '150000', count: 2 });
    expect(s.months[2]).toMatchObject({ month: 3, total: '200000', count: 1 });
    expect(s.months[1]).toMatchObject({ month: 2, total: '0', count: 0 });
    expect(s.grandTotal).toBe('350000');
    expect(s.grandCount).toBe(3);
    expect(s.orderedTotal).toBe('100000');
    expect(s.pendingTotal).toBe('50000');
    expect(s.byStatus.find((g) => g.key === 'APPROVED')).toMatchObject({ total: '200000', count: 1 });
    expect(s.byDepartment.find((g) => g.key === 'Eng')).toMatchObject({ total: '150000', count: 2 });
    expect(s.byVendor.find((g) => g.key === 'NCC A')).toMatchObject({ total: '300000', count: 2 });
  });

  it('byDepartment/byVendor sắp xếp giảm dần theo tổng tiền', () => {
    const rows = [
      { createdAt: new Date('2026-02-01T00:00:00Z'), totalAmount: 10, status: 'PENDING', departmentName: 'Small', vendorName: 'V1' },
      { createdAt: new Date('2026-02-01T00:00:00Z'), totalAmount: 1000, status: 'PENDING', departmentName: 'Big', vendorName: 'V2' },
    ];
    const s = aggregatePurchaseStats(rows, 2026);
    expect(s.byDepartment[0].key).toBe('Big');
    expect(s.byVendor[0].key).toBe('V2');
  });

  it('phòng ban null gom vào nhóm "—"', () => {
    const rows = [
      { createdAt: new Date('2026-02-01T00:00:00Z'), totalAmount: 100, status: 'PENDING', departmentName: null, vendorName: 'V1' },
    ];
    const s = aggregatePurchaseStats(rows, 2026);
    expect(s.byDepartment.find((g) => g.key === '—')).toMatchObject({ total: '100', count: 1 });
  });

  it('empty year → 12 zero months, zero totals', () => {
    const s = aggregatePurchaseStats([], 2025);
    expect(s.months).toHaveLength(12);
    expect(s.months.every((m) => m.total === '0' && m.count === 0)).toBe(true);
    expect(s.grandTotal).toBe('0');
    expect(s.grandCount).toBe(0);
  });
});

// ── list scope (mirror payment) ───────────────────────────────────────────────
describe('purchaseRequestService.list — scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestRepoMock.findAll.mockResolvedValue({
      data: [storedRequest()],
      total: 1,
      totalAmount: '20470320',
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it("scope 'mine' lọc theo employeeId của người gọi", async () => {
    await purchaseRequestService.list('tenant-1', 'emp-1', { scope: 'mine' }, { page: 1, limit: 20 });
    const [, filters] = requestRepoMock.findAll.mock.calls[0];
    expect(filters.employeeId).toBe('emp-1');
  });

  it("scope 'all' KHÔNG lọc theo employeeId, trả totalAmount", async () => {
    const result = await purchaseRequestService.list('tenant-1', '', { scope: 'all' }, { page: 1, limit: 20 });
    const [, filters] = requestRepoMock.findAll.mock.calls[0];
    expect(filters.employeeId).toBeUndefined();
    expect(result.totalAmount).toBe('20470320');
    expect(result.items).toHaveLength(1);
  });
});
