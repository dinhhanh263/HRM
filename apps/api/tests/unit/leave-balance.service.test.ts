import { describe, it, expect, vi, beforeEach } from 'vitest';

const leaveTypeRepoMock = {
  findAll: vi.fn(),
  findById: vi.fn(),
};
const leaveBalanceRepoMock = {
  findForEmployeeYear: vi.fn(),
  findManyForEmployeesYear: vi.fn(),
  upsertAllocation: vi.fn(),
};
const leaveRequestRepoMock = {
  aggregateDaysByStatus: vi.fn(),
  aggregateDaysByStatusForEmployees: vi.fn(),
};
const employeeRepoMock = {
  findById: vi.fn(),
};

vi.mock('../../src/domain/repositories/leave-type.repository.js', () => ({
  leaveTypeRepository: leaveTypeRepoMock,
}));
vi.mock('../../src/domain/repositories/leave-balance.repository.js', () => ({
  leaveBalanceRepository: leaveBalanceRepoMock,
}));
vi.mock('../../src/domain/repositories/leave-request.repository.js', () => ({
  leaveRequestRepository: leaveRequestRepoMock,
}));
vi.mock('../../src/domain/repositories/employee.repository.js', () => ({
  employeeRepository: employeeRepoMock,
}));

const { leaveBalanceService } = await import(
  '../../src/domain/services/leave-balance.service.js'
);

function annualType(overrides = {}) {
  return {
    id: 'lt-1',
    tenantId: 'tenant-1',
    name: 'Nghỉ phép năm',
    code: 'ANNUAL',
    colorHex: '#3B82F6',
    defaultDays: 12,
    paid: true,
    ...overrides,
  };
}

describe('leaveBalanceService.setAllocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    employeeRepoMock.findById.mockResolvedValue({ id: 'emp-1', tenantId: 'tenant-1' });
    leaveTypeRepoMock.findById.mockResolvedValue(annualType());
    leaveRequestRepoMock.aggregateDaysByStatus.mockResolvedValue([]);
  });

  it('upserts the override then returns the recomputed balance for that year', async () => {
    leaveBalanceRepoMock.upsertAllocation.mockResolvedValue({
      employeeId: 'emp-1',
      leaveTypeId: 'lt-1',
      year: 2026,
      allocated: 20,
    });
    // getBalances re-reads active types + overrides after the upsert.
    leaveTypeRepoMock.findAll.mockResolvedValue([annualType()]);
    leaveBalanceRepoMock.findForEmployeeYear.mockResolvedValue([
      { leaveTypeId: 'lt-1', allocated: 20 },
    ]);

    const result = await leaveBalanceService.setAllocation(
      'tenant-1',
      'emp-1',
      'lt-1',
      2026,
      20,
    );

    expect(leaveBalanceRepoMock.upsertAllocation).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      employeeId: 'emp-1',
      leaveTypeId: 'lt-1',
      year: 2026,
      allocated: 20,
    });
    const annual = result.find((b) => b.leaveTypeId === 'lt-1');
    expect(annual?.allocated).toBe(20);
    expect(annual?.remaining).toBe(20);
  });

  it('throws NotFoundError when the employee does not belong to the tenant', async () => {
    employeeRepoMock.findById.mockResolvedValue(null);

    await expect(
      leaveBalanceService.setAllocation('tenant-1', 'ghost', 'lt-1', 2026, 10),
    ).rejects.toThrow('Employee not found');
    expect(leaveBalanceRepoMock.upsertAllocation).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the leave type does not belong to the tenant', async () => {
    leaveTypeRepoMock.findById.mockResolvedValue(null);

    await expect(
      leaveBalanceService.setAllocation('tenant-1', 'emp-1', 'ghost', 2026, 10),
    ).rejects.toThrow('Leave type not found');
    expect(leaveBalanceRepoMock.upsertAllocation).not.toHaveBeenCalled();
  });
});

describe('leaveBalanceService.getRosterBalances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty types and balances without querying when no employees are in scope', async () => {
    const result = await leaveBalanceService.getRosterBalances('tenant-1', [], 2026);

    expect(result.leaveTypes).toEqual([]);
    expect(result.balancesByEmployee.size).toBe(0);
    expect(leaveTypeRepoMock.findAll).not.toHaveBeenCalled();
    expect(leaveBalanceRepoMock.findManyForEmployeesYear).not.toHaveBeenCalled();
    expect(leaveRequestRepoMock.aggregateDaysByStatusForEmployees).not.toHaveBeenCalled();
  });

  it('batches all employees with a constant number of queries (no N+1)', async () => {
    leaveTypeRepoMock.findAll.mockResolvedValue([annualType()]);
    leaveBalanceRepoMock.findManyForEmployeesYear.mockResolvedValue([]);
    leaveRequestRepoMock.aggregateDaysByStatusForEmployees.mockResolvedValue([]);

    await leaveBalanceService.getRosterBalances('tenant-1', ['emp-1', 'emp-2', 'emp-3'], 2026);

    // One call each regardless of the number of employees.
    expect(leaveTypeRepoMock.findAll).toHaveBeenCalledTimes(1);
    expect(leaveBalanceRepoMock.findManyForEmployeesYear).toHaveBeenCalledTimes(1);
    expect(leaveBalanceRepoMock.findManyForEmployeesYear).toHaveBeenCalledWith(
      ['emp-1', 'emp-2', 'emp-3'],
      2026,
    );
    expect(leaveRequestRepoMock.aggregateDaysByStatusForEmployees).toHaveBeenCalledTimes(1);
  });

  it('computes per-employee balances: override beats defaultDays, remaining = allocated − used − pending', async () => {
    leaveTypeRepoMock.findAll.mockResolvedValue([annualType()]); // defaultDays 12
    // emp-1 has an HR override of 20; emp-2 has none → falls back to defaultDays.
    leaveBalanceRepoMock.findManyForEmployeesYear.mockResolvedValue([
      { employeeId: 'emp-1', leaveTypeId: 'lt-1', allocated: 20 },
    ]);
    leaveRequestRepoMock.aggregateDaysByStatusForEmployees.mockResolvedValue([
      { employeeId: 'emp-1', leaveTypeId: 'lt-1', status: 'APPROVED', _sum: { totalDays: 5 } },
      { employeeId: 'emp-1', leaveTypeId: 'lt-1', status: 'PENDING', _sum: { totalDays: 2 } },
    ]);

    const result = await leaveBalanceService.getRosterBalances(
      'tenant-1',
      ['emp-1', 'emp-2'],
      2026,
    );

    const emp1 = result.balancesByEmployee.get('emp-1')!;
    const annual1 = emp1.find((b) => b.leaveTypeId === 'lt-1')!;
    expect(annual1.allocated).toBe(20);
    expect(annual1.used).toBe(5);
    expect(annual1.pending).toBe(2);
    expect(annual1.remaining).toBe(13);

    // emp-2: no override, no requests → default 12, nothing used/pending.
    const emp2 = result.balancesByEmployee.get('emp-2')!;
    const annual2 = emp2.find((b) => b.leaveTypeId === 'lt-1')!;
    expect(annual2.allocated).toBe(12);
    expect(annual2.used).toBe(0);
    expect(annual2.pending).toBe(0);
    expect(annual2.remaining).toBe(12);
  });
});
