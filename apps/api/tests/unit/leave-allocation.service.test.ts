import { describe, it, expect, vi, beforeEach } from 'vitest';

const settingsMock = { getProRata: vi.fn() };
const typeRepoMock = { findAll: vi.fn() };
const balanceRepoMock = { upsertAllocation: vi.fn() };

vi.mock('../../src/domain/services/leave-settings.service.js', () => ({
  leaveSettingsService: settingsMock,
}));
vi.mock('../../src/domain/repositories/leave-type.repository.js', () => ({
  leaveTypeRepository: typeRepoMock,
}));
vi.mock('../../src/domain/repositories/leave-balance.repository.js', () => ({
  leaveBalanceRepository: balanceRepoMock,
}));

const { leaveAllocationService } = await import(
  '../../src/domain/services/leave-allocation.service.js'
);

function type(id: string, defaultDays: number, active = true) {
  return { id, defaultDays, active, name: id, code: id };
}

describe('leaveAllocationService.seedProratedAllocations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    balanceRepoMock.upsertAllocation.mockResolvedValue({});
  });

  it('does nothing when the pro-rata toggle is off', async () => {
    settingsMock.getProRata.mockResolvedValue({ proRataEnabled: false });

    await leaveAllocationService.seedProratedAllocations(
      'tenant-1',
      'emp-1',
      new Date('2026-11-15T00:00:00.000Z'),
    );

    expect(typeRepoMock.findAll).not.toHaveBeenCalled();
    expect(balanceRepoMock.upsertAllocation).not.toHaveBeenCalled();
  });

  it('does nothing when joinDate is absent', async () => {
    settingsMock.getProRata.mockResolvedValue({ proRataEnabled: true });

    await leaveAllocationService.seedProratedAllocations('tenant-1', 'emp-1', null);

    expect(typeRepoMock.findAll).not.toHaveBeenCalled();
    expect(balanceRepoMock.upsertAllocation).not.toHaveBeenCalled();
  });

  it('seeds pro-rated overrides for active types with defaultDays > 0 (Nov join → 2)', async () => {
    settingsMock.getProRata.mockResolvedValue({ proRataEnabled: true });
    typeRepoMock.findAll.mockResolvedValue([type('annual', 12), type('sick', 6)]);

    await leaveAllocationService.seedProratedAllocations(
      'tenant-1',
      'emp-1',
      new Date('2026-11-15T00:00:00.000Z'),
    );

    expect(typeRepoMock.findAll).toHaveBeenCalledWith('tenant-1', { activeOnly: true });
    expect(balanceRepoMock.upsertAllocation).toHaveBeenCalledTimes(2);
    expect(balanceRepoMock.upsertAllocation).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      employeeId: 'emp-1',
      leaveTypeId: 'annual',
      year: 2026,
      allocated: 2, // 12 * 2/12
    });
    expect(balanceRepoMock.upsertAllocation).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      employeeId: 'emp-1',
      leaveTypeId: 'sick',
      year: 2026,
      allocated: 1, // 6 * 2/12 = 1
    });
  });

  it('skips leave types with defaultDays === 0', async () => {
    settingsMock.getProRata.mockResolvedValue({ proRataEnabled: true });
    typeRepoMock.findAll.mockResolvedValue([type('annual', 12), type('unpaid', 0)]);

    await leaveAllocationService.seedProratedAllocations(
      'tenant-1',
      'emp-1',
      new Date('2026-11-15T00:00:00.000Z'),
    );

    expect(balanceRepoMock.upsertAllocation).toHaveBeenCalledTimes(1);
    expect(balanceRepoMock.upsertAllocation).toHaveBeenCalledWith(
      expect.objectContaining({ leaveTypeId: 'annual' }),
    );
  });

  it('uses the join year derived from joinDate', async () => {
    settingsMock.getProRata.mockResolvedValue({ proRataEnabled: true });
    typeRepoMock.findAll.mockResolvedValue([type('annual', 12)]);

    await leaveAllocationService.seedProratedAllocations(
      'tenant-1',
      'emp-1',
      new Date('2025-01-01T00:00:00.000Z'),
    );

    expect(balanceRepoMock.upsertAllocation).toHaveBeenCalledWith(
      expect.objectContaining({ year: 2025, allocated: 12 }),
    );
  });
});
