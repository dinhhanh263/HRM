import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMock = {
  findByTenant: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

vi.mock('../../src/domain/repositories/timesheet-policy.repository.js', () => ({
  timesheetPolicyRepository: repoMock,
}));

const { timesheetPolicyService } = await import(
  '../../src/domain/services/timesheet-policy.service.js'
);

function makePolicy(overrides = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'tp-1',
    tenantId: 'tenant-1',
    workdays: [1, 2, 3, 4, 5],
    standardHoursPerDay: 8,
    nightStart: '22:00',
    nightEnd: '06:00',
    otWeekday: 1.5,
    otWeekend: 2.0,
    otHoliday: 3.0,
    nightExtra: 0.3,
    nightOtExtra: 0.2,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('timesheetPolicyService.getPolicy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should auto-seed VN defaults on first access', async () => {
    repoMock.findByTenant.mockResolvedValue(null);
    repoMock.create.mockResolvedValue(makePolicy());

    const result = await timesheetPolicyService.getPolicy('tenant-1');

    expect(repoMock.create).toHaveBeenCalledOnce();
    expect(result.workdays).toEqual([1, 2, 3, 4, 5]);
    expect(result.otHoliday).toBe(3.0);
    expect(typeof result.createdAt).toBe('string');
  });

  it('should return the existing policy without seeding', async () => {
    repoMock.findByTenant.mockResolvedValue(makePolicy({ otWeekday: 1.8 }));

    const result = await timesheetPolicyService.getPolicy('tenant-1');

    expect(repoMock.create).not.toHaveBeenCalled();
    expect(result.otWeekday).toBe(1.8);
  });
});

describe('timesheetPolicyService.updatePolicy validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoMock.findByTenant.mockResolvedValue(makePolicy());
    repoMock.update.mockImplementation((_t: string, data: Record<string, unknown>) =>
      Promise.resolve(makePolicy(data)),
    );
  });

  it('should reject an OT multiplier below 1.0', async () => {
    await expect(
      timesheetPolicyService.updatePolicy('tenant-1', { otWeekday: 0.9 }),
    ).rejects.toThrow('otWeekday must be at least 1.0');
    expect(repoMock.update).not.toHaveBeenCalled();
  });

  it('should reject a negative night premium', async () => {
    await expect(
      timesheetPolicyService.updatePolicy('tenant-1', { nightExtra: -0.1 }),
    ).rejects.toThrow('nightExtra must be at least 0');
  });

  it('should reject workdays outside 0..6', async () => {
    await expect(
      timesheetPolicyService.updatePolicy('tenant-1', { workdays: [1, 7] }),
    ).rejects.toThrow('workdays must be integers between 0');
  });

  it('should reject duplicate workdays', async () => {
    await expect(
      timesheetPolicyService.updatePolicy('tenant-1', { workdays: [1, 1, 2] }),
    ).rejects.toThrow('workdays must not contain duplicates');
  });

  it('should accept valid multipliers and persist them', async () => {
    const result = await timesheetPolicyService.updatePolicy('tenant-1', {
      otWeekday: 1.5,
      otWeekend: 2.0,
      nightExtra: 0.3,
      workdays: [1, 2, 3, 4, 5, 6],
    });

    expect(repoMock.update).toHaveBeenCalledOnce();
    expect(result.workdays).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('should seed defaults first if no policy exists yet on update', async () => {
    repoMock.findByTenant.mockResolvedValue(null);
    repoMock.create.mockResolvedValue(makePolicy());

    await timesheetPolicyService.updatePolicy('tenant-1', { otHoliday: 3.5 });

    expect(repoMock.create).toHaveBeenCalledOnce();
    expect(repoMock.update).toHaveBeenCalledOnce();
  });
});
