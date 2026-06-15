import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMock = {
  findByEmployeeAndDate: vi.fn(),
  findByEmployeeAndRange: vi.fn(),
  findForReview: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

vi.mock('../../src/domain/repositories/attendance.repository.js', () => ({
  attendanceRepository: repoMock,
  attendanceWithEmployee: {},
}));

const { attendanceService } = await import('../../src/domain/services/attendance.service.js');

function makeRecord(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-06-02T10:00:00.000Z');
  return {
    id: 'att-1',
    tenantId: 'tenant-1',
    employeeId: 'emp-1',
    workDate: new Date('2026-06-02T00:00:00.000Z'),
    checkInAt: null,
    checkOutAt: null,
    note: null,
    workedHours: null,
    source: 'SELF',
    adjustedById: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('attendanceService.checkIn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should create a SELF record with checkInAt when none exists', async () => {
    repoMock.findByEmployeeAndDate.mockResolvedValue(null);
    repoMock.create.mockImplementation((data: { checkInAt: Date }) =>
      Promise.resolve(makeRecord({ checkInAt: data.checkInAt })),
    );
    const now = new Date('2026-06-02T01:00:00.000Z');

    const result = await attendanceService.checkIn('tenant-1', 'emp-1', { note: 'Office' }, now);

    const arg = repoMock.create.mock.calls[0][0];
    expect(arg.checkInAt).toEqual(now);
    expect(arg.source).toBe('SELF');
    expect(arg.workDate.toISOString()).toBe('2026-06-02T00:00:00.000Z');
    expect(result.checkInAt).toBe('2026-06-02T01:00:00.000Z');
  });

  it('should reject a second check-in on the same date', async () => {
    repoMock.findByEmployeeAndDate.mockResolvedValue(
      makeRecord({ checkInAt: new Date('2026-06-02T01:00:00.000Z') }),
    );

    await expect(
      attendanceService.checkIn('tenant-1', 'emp-1', {}, new Date('2026-06-02T02:00:00.000Z')),
    ).rejects.toThrow('Already checked in');
    expect(repoMock.create).not.toHaveBeenCalled();
  });

  it('should reject a future work date', async () => {
    await expect(
      attendanceService.checkIn(
        'tenant-1',
        'emp-1',
        { workDate: '2026-06-03' },
        new Date('2026-06-02T02:00:00.000Z'),
      ),
    ).rejects.toThrow('future date');
  });
});

describe('attendanceService.checkOut', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should set checkOutAt and compute workedHours', async () => {
    repoMock.findByEmployeeAndDate.mockResolvedValue(
      makeRecord({ checkInAt: new Date('2026-06-02T01:00:00.000Z') }),
    );
    repoMock.update.mockImplementation((_id: string, data: Record<string, unknown>) =>
      Promise.resolve(makeRecord({ checkInAt: new Date('2026-06-02T01:00:00.000Z'), ...data })),
    );
    const now = new Date('2026-06-02T09:00:00.000Z');

    const result = await attendanceService.checkOut('tenant-1', 'emp-1', {}, now);

    const data = repoMock.update.mock.calls[0][1];
    expect(data.checkOutAt).toEqual(now);
    expect(data.workedHours).toBe(8);
    expect(result.workedHours).toBe(8);
  });

  it('should reject check-out without a prior check-in', async () => {
    repoMock.findByEmployeeAndDate.mockResolvedValue(null);

    await expect(
      attendanceService.checkOut('tenant-1', 'emp-1', {}, new Date('2026-06-02T09:00:00.000Z')),
    ).rejects.toThrow('must check in');
    expect(repoMock.update).not.toHaveBeenCalled();
  });

  it('should reject a second check-out', async () => {
    repoMock.findByEmployeeAndDate.mockResolvedValue(
      makeRecord({
        checkInAt: new Date('2026-06-02T01:00:00.000Z'),
        checkOutAt: new Date('2026-06-02T09:00:00.000Z'),
      }),
    );

    await expect(
      attendanceService.checkOut('tenant-1', 'emp-1', {}, new Date('2026-06-02T10:00:00.000Z')),
    ).rejects.toThrow('Already checked out');
  });
});

describe('attendanceService.listMine', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should query the requested month range and map records', async () => {
    repoMock.findByEmployeeAndRange.mockResolvedValue([
      makeRecord({ checkInAt: new Date('2026-06-02T01:00:00.000Z'), workedHours: 8 }),
    ]);

    const result = await attendanceService.listMine('tenant-1', 'emp-1', '2026-06');

    const [, , start, end] = repoMock.findByEmployeeAndRange.mock.calls[0];
    expect(start.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(result).toHaveLength(1);
    expect(result[0].workDate).toBe('2026-06-02');
  });
});

describe('attendanceService.adjust', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should create a MANUAL_ADJUST record stamped with the reviewer when none exists', async () => {
    repoMock.findByEmployeeAndDate.mockResolvedValue(null);
    repoMock.create.mockImplementation((data: Record<string, unknown>) =>
      Promise.resolve(
        makeRecord({
          employeeId: 'emp-2',
          source: 'MANUAL_ADJUST',
          adjustedById: 'reviewer-1',
          checkInAt: data.checkInAt,
          checkOutAt: data.checkOutAt,
          workedHours: data.workedHours,
        }),
      ),
    );

    const result = await attendanceService.adjust('tenant-1', 'reviewer-1', {
      employeeId: 'emp-2',
      workDate: '2026-06-01',
      checkInAt: '2026-06-01T01:00:00.000Z',
      checkOutAt: '2026-06-01T09:00:00.000Z',
      note: 'Forgot to clock out',
    });

    const arg = repoMock.create.mock.calls[0][0];
    expect(arg.source).toBe('MANUAL_ADJUST');
    expect(arg.adjustedBy).toEqual({ connect: { id: 'reviewer-1' } });
    expect(arg.employee).toEqual({ connect: { id: 'emp-2' } });
    expect(arg.workedHours).toBe(8);
    expect(result.source).toBe('MANUAL_ADJUST');
    expect(result.adjustedById).toBe('reviewer-1');
  });

  it('should update an existing record and recompute workedHours', async () => {
    repoMock.findByEmployeeAndDate.mockResolvedValue(makeRecord({ id: 'att-9', employeeId: 'emp-2' }));
    repoMock.update.mockImplementation((_id: string, data: Record<string, unknown>) =>
      Promise.resolve(makeRecord({ id: 'att-9', employeeId: 'emp-2', ...data })),
    );

    await attendanceService.adjust('tenant-1', 'reviewer-1', {
      employeeId: 'emp-2',
      workDate: '2026-06-01',
      checkInAt: '2026-06-01T01:00:00.000Z',
      checkOutAt: '2026-06-01T10:30:00.000Z',
    });

    const [id, data] = repoMock.update.mock.calls[0];
    expect(id).toBe('att-9');
    expect(data.source).toBe('MANUAL_ADJUST');
    expect(data.adjustedBy).toEqual({ connect: { id: 'reviewer-1' } });
    expect(data.workedHours).toBe(9.5);
    expect(repoMock.create).not.toHaveBeenCalled();
  });

  it('should reject a future work date', async () => {
    await expect(
      attendanceService.adjust(
        'tenant-1',
        'reviewer-1',
        { employeeId: 'emp-2', workDate: '2999-01-01' },
        new Date('2026-06-02T00:00:00.000Z'),
      ),
    ).rejects.toThrow('future date');
  });
});

describe('attendanceService.listForReview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should scope to the given employee ids and the month range', async () => {
    repoMock.findForReview.mockResolvedValue([
      makeRecord({ employeeId: 'emp-2', checkInAt: new Date('2026-06-02T01:00:00.000Z') }),
    ]);

    const result = await attendanceService.listForReview('tenant-1', ['emp-2', 'emp-3'], '2026-06');

    const [tenantId, ids, start, end] = repoMock.findForReview.mock.calls[0];
    expect(tenantId).toBe('tenant-1');
    expect(ids).toEqual(['emp-2', 'emp-3']);
    expect(start.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(result).toHaveLength(1);
  });

  it('should pass null employee ids for tenant-wide (HR) scope', async () => {
    repoMock.findForReview.mockResolvedValue([]);

    await attendanceService.listForReview('tenant-1', null, '2026-06');

    expect(repoMock.findForReview.mock.calls[0][1]).toBeNull();
  });
});
