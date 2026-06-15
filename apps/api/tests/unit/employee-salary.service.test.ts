import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMock = {
  listRoster: vi.fn(),
  findByEmployee: vi.fn(),
  findLatest: vi.fn(),
  findInForce: vi.fn(),
  findById: vi.fn(),
  createClosingPrior: vi.fn(),
  deleteReopeningPrior: vi.fn(),
};

vi.mock('../../src/domain/repositories/employee-salary.repository.js', () => ({
  employeeSalaryRepository: repoMock,
}));

const { employeeSalaryService } = await import(
  '../../src/domain/services/employee-salary.service.js'
);

function makeRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'sal-1',
    tenantId: 'tenant-1',
    employeeId: 'emp-1',
    baseSalary: '20000000',
    allowances: [],
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
    note: null,
    createdById: 'user-1',
    createdAt: now,
    updatedAt: now,
    employee: null,
    ...overrides,
  };
}

const validInput = {
  employeeId: 'emp-1',
  baseSalary: '25000000',
  effectiveFrom: '2026-06-01',
};

describe('employeeSalaryService.create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoMock.createClosingPrior.mockImplementation((data: Record<string, unknown>) =>
      Promise.resolve(makeRow({ ...data, id: 'sal-new', effectiveTo: null })),
    );
  });

  it('should close the prior in-force record at the day before the new effectiveFrom', async () => {
    repoMock.findLatest.mockResolvedValue(
      makeRow({ id: 'sal-1', effectiveFrom: new Date('2026-01-01T00:00:00.000Z'), effectiveTo: null }),
    );

    await employeeSalaryService.create('tenant-1', validInput, 'user-9');

    expect(repoMock.createClosingPrior).toHaveBeenCalledOnce();
    const [data, priorClose] = repoMock.createClosingPrior.mock.calls[0];
    expect(data.effectiveFrom.toISOString().slice(0, 10)).toBe('2026-06-01');
    expect(data.effectiveTo ?? null).toBeNull();
    expect(priorClose).not.toBeNull();
    expect(priorClose.id).toBe('sal-1');
    expect(priorClose.effectiveTo.toISOString().slice(0, 10)).toBe('2026-05-31');
  });

  it('should create the first-ever record without closing any prior', async () => {
    repoMock.findLatest.mockResolvedValue(null);

    await employeeSalaryService.create('tenant-1', validInput, 'user-9');

    expect(repoMock.createClosingPrior).toHaveBeenCalledOnce();
    const [, priorClose] = repoMock.createClosingPrior.mock.calls[0];
    expect(priorClose).toBeNull();
  });

  it('should stamp the creator id on the new record', async () => {
    repoMock.findLatest.mockResolvedValue(null);

    await employeeSalaryService.create('tenant-1', validInput, 'user-9');

    const [data] = repoMock.createClosingPrior.mock.calls[0];
    expect(data.createdById).toBe('user-9');
  });

  it('should default allowances to an empty array when omitted', async () => {
    repoMock.findLatest.mockResolvedValue(null);

    await employeeSalaryService.create('tenant-1', validInput, 'user-9');

    const [data] = repoMock.createClosingPrior.mock.calls[0];
    expect(data.allowances).toEqual([]);
  });

  it('should reject an effectiveFrom equal to the latest record', async () => {
    repoMock.findLatest.mockResolvedValue(
      makeRow({ effectiveFrom: new Date('2026-06-01T00:00:00.000Z') }),
    );

    await expect(
      employeeSalaryService.create('tenant-1', validInput, 'user-9'),
    ).rejects.toThrow('effectiveFrom must be after the current salary effective date');
    expect(repoMock.createClosingPrior).not.toHaveBeenCalled();
  });

  it('should reject an effectiveFrom before the latest record', async () => {
    repoMock.findLatest.mockResolvedValue(
      makeRow({ effectiveFrom: new Date('2026-07-01T00:00:00.000Z') }),
    );

    await expect(
      employeeSalaryService.create('tenant-1', validInput, 'user-9'),
    ).rejects.toThrow('effectiveFrom must be after the current salary effective date');
  });

  it('should reject a negative baseSalary', async () => {
    repoMock.findLatest.mockResolvedValue(null);

    await expect(
      employeeSalaryService.create('tenant-1', { ...validInput, baseSalary: '-1' }, 'user-9'),
    ).rejects.toThrow('baseSalary must be a non-negative amount');
  });

  it('should reject an unparseable baseSalary', async () => {
    repoMock.findLatest.mockResolvedValue(null);

    await expect(
      employeeSalaryService.create('tenant-1', { ...validInput, baseSalary: 'abc' }, 'user-9'),
    ).rejects.toThrow('baseSalary must be a non-negative amount');
  });

  it('should reject an invalid effectiveFrom date', async () => {
    repoMock.findLatest.mockResolvedValue(null);

    await expect(
      employeeSalaryService.create('tenant-1', { ...validInput, effectiveFrom: 'not-a-date' }, 'user-9'),
    ).rejects.toThrow('effectiveFrom must be a valid date');
  });

  it('should reject an allowance with a negative amount', async () => {
    repoMock.findLatest.mockResolvedValue(null);

    await expect(
      employeeSalaryService.create(
        'tenant-1',
        { ...validInput, allowances: [{ name: 'Lunch', amount: -5, taxable: false }] },
        'user-9',
      ),
    ).rejects.toThrow('allowance amount must be a non-negative number');
  });

  it('should reject an allowance with an empty name', async () => {
    repoMock.findLatest.mockResolvedValue(null);

    await expect(
      employeeSalaryService.create(
        'tenant-1',
        { ...validInput, allowances: [{ name: '  ', amount: 500000, taxable: true }] },
        'user-9',
      ),
    ).rejects.toThrow('allowance name is required');
  });
});

describe('employeeSalaryService.listRoster', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should pair each employee with their in-force salary, or null when unset', async () => {
    repoMock.listRoster.mockResolvedValue([
      {
        id: 'emp-1',
        fullName: 'Nguyễn Văn A',
        employeeCode: 'E001',
        avatar: null,
        department: { name: 'Engineering' },
        salaries: [makeRow({ id: 'sal-1', baseSalary: '20000000.00' })],
      },
      {
        id: 'emp-2',
        fullName: 'Trần Thị B',
        employeeCode: 'E002',
        avatar: null,
        department: null,
        salaries: [],
      },
    ]);

    const result = await employeeSalaryService.listRoster('tenant-1', {});

    expect(result).toHaveLength(2);
    expect(result[0].employee.departmentName).toBe('Engineering');
    expect(result[0].salary?.baseSalary).toBe('20000000');
    expect(result[1].salary).toBeNull();
  });

  it('should forward department and search filters to the repository', async () => {
    repoMock.listRoster.mockResolvedValue([]);

    await employeeSalaryService.listRoster('tenant-1', { departmentId: 'dept-9', search: 'a' });

    expect(repoMock.listRoster).toHaveBeenCalledWith('tenant-1', expect.any(Date), {
      departmentId: 'dept-9',
      search: 'a',
    });
  });
});

describe('employeeSalaryService.getInForce', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return the in-force record mapped to a DTO', async () => {
    repoMock.findInForce.mockResolvedValue(makeRow({ baseSalary: '20000000.00' }));

    const result = await employeeSalaryService.getInForce('tenant-1', 'emp-1', new Date('2026-03-01'));

    expect(repoMock.findInForce).toHaveBeenCalledWith('tenant-1', 'emp-1', expect.any(Date));
    expect(result?.baseSalary).toBe('20000000');
    expect(result?.effectiveTo).toBeNull();
  });

  it('should return null when no record is in force', async () => {
    repoMock.findInForce.mockResolvedValue(null);

    const result = await employeeSalaryService.getInForce('tenant-1', 'emp-1', new Date('2026-03-01'));

    expect(result).toBeNull();
  });
});

describe('employeeSalaryService.listForEmployee', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should map each record, serializing money as a whole-VND string', async () => {
    repoMock.findByEmployee.mockResolvedValue([
      makeRow({ id: 'sal-2', baseSalary: '25000000.00', effectiveFrom: new Date('2026-06-01') }),
      makeRow({ id: 'sal-1', baseSalary: '20000000.00', effectiveTo: new Date('2026-05-31') }),
    ]);

    const result = await employeeSalaryService.listForEmployee('tenant-1', 'emp-1');

    expect(result).toHaveLength(2);
    expect(result[0].baseSalary).toBe('25000000');
    expect(result[0].effectiveFrom).toBe('2026-06-01');
    expect(result[1].effectiveTo).toBe('2026-05-31');
  });
});

describe('employeeSalaryService.remove', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should delete the head record and reopen its predecessor', async () => {
    repoMock.findById.mockResolvedValue(makeRow({ id: 'sal-2', employeeId: 'emp-1' }));
    repoMock.findByEmployee.mockResolvedValue([
      makeRow({ id: 'sal-2', effectiveFrom: new Date('2026-06-01') }),
      makeRow({ id: 'sal-1', effectiveTo: new Date('2026-05-31') }),
    ]);

    await employeeSalaryService.remove('tenant-1', 'sal-2');

    expect(repoMock.deleteReopeningPrior).toHaveBeenCalledWith('tenant-1', 'sal-2', 'sal-1');
  });

  it('should pass a null predecessor when removing the only record', async () => {
    repoMock.findById.mockResolvedValue(makeRow({ id: 'sal-1', employeeId: 'emp-1' }));
    repoMock.findByEmployee.mockResolvedValue([makeRow({ id: 'sal-1' })]);

    await employeeSalaryService.remove('tenant-1', 'sal-1');

    expect(repoMock.deleteReopeningPrior).toHaveBeenCalledWith('tenant-1', 'sal-1', null);
  });

  it('should reject removing a record that is not the head of the history', async () => {
    repoMock.findById.mockResolvedValue(makeRow({ id: 'sal-1', employeeId: 'emp-1' }));
    repoMock.findByEmployee.mockResolvedValue([
      makeRow({ id: 'sal-2', effectiveFrom: new Date('2026-06-01') }),
      makeRow({ id: 'sal-1', effectiveTo: new Date('2026-05-31') }),
    ]);

    await expect(employeeSalaryService.remove('tenant-1', 'sal-1')).rejects.toThrow(
      'only the most recent salary record may be removed',
    );
    expect(repoMock.deleteReopeningPrior).not.toHaveBeenCalled();
  });

  it('should throw when the record does not exist', async () => {
    repoMock.findById.mockResolvedValue(null);

    await expect(employeeSalaryService.remove('tenant-1', 'missing')).rejects.toThrow(
      'Salary record not found',
    );
  });
});
