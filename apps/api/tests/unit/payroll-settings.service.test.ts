import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMock = {
  findByTenant: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

vi.mock('../../src/domain/repositories/payroll-settings.repository.js', () => ({
  payrollSettingsRepository: repoMock,
}));

const { payrollSettingsService } = await import(
  '../../src/domain/services/payroll-settings.service.js'
);

const DEFAULT_BRACKETS = [
  { upTo: 5_000_000, rate: 0.05 },
  { upTo: 10_000_000, rate: 0.1 },
  { upTo: 18_000_000, rate: 0.15 },
  { upTo: 32_000_000, rate: 0.2 },
  { upTo: 52_000_000, rate: 0.25 },
  { upTo: 80_000_000, rate: 0.3 },
  { upTo: null, rate: 0.35 },
];

function makeSettings(overrides = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'ps-1',
    tenantId: 'tenant-1',
    currency: 'VND',
    payDay: 5,
    socialInsuranceRate: 0.08,
    healthInsuranceRate: 0.015,
    unemploymentInsuranceRate: 0.01,
    insuranceBase: 'BASE_SALARY',
    insuranceCap: null,
    personalDeduction: '11000000',
    dependentDeduction: '4400000',
    taxBrackets: DEFAULT_BRACKETS,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('payrollSettingsService.getSettings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should auto-seed VN defaults on first access', async () => {
    repoMock.findByTenant.mockResolvedValue(null);
    repoMock.create.mockResolvedValue(makeSettings());

    const result = await payrollSettingsService.getSettings('tenant-1');

    expect(repoMock.create).toHaveBeenCalledOnce();
    expect(result.socialInsuranceRate).toBe(0.08);
    expect(result.personalDeduction).toBe('11000000');
    expect(result.taxBrackets).toHaveLength(7);
    expect(result.taxBrackets.at(-1)).toEqual({ upTo: null, rate: 0.35 });
  });

  it('should return existing settings without seeding', async () => {
    repoMock.findByTenant.mockResolvedValue(makeSettings({ payDay: 10 }));

    const result = await payrollSettingsService.getSettings('tenant-1');

    expect(repoMock.create).not.toHaveBeenCalled();
    expect(result.payDay).toBe(10);
  });

  it('should serialize Decimal money fields as whole-VND strings', async () => {
    repoMock.findByTenant.mockResolvedValue(
      makeSettings({ personalDeduction: '11000000.00', insuranceCap: '36000000.00' }),
    );

    const result = await payrollSettingsService.getSettings('tenant-1');

    expect(result.personalDeduction).toBe('11000000');
    expect(result.insuranceCap).toBe('36000000');
  });
});

describe('payrollSettingsService.updateSettings validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoMock.findByTenant.mockResolvedValue(makeSettings());
    repoMock.update.mockImplementation((_t: string, data: Record<string, unknown>) =>
      Promise.resolve(makeSettings(data)),
    );
  });

  it('should reject an insurance rate above 1', async () => {
    await expect(
      payrollSettingsService.updateSettings('tenant-1', { socialInsuranceRate: 1.2 }),
    ).rejects.toThrow('socialInsuranceRate must be a fraction between 0 and 1');
    expect(repoMock.update).not.toHaveBeenCalled();
  });

  it('should reject a negative insurance rate', async () => {
    await expect(
      payrollSettingsService.updateSettings('tenant-1', { healthInsuranceRate: -0.01 }),
    ).rejects.toThrow('healthInsuranceRate must be a fraction between 0 and 1');
  });

  it('should reject a payDay outside 1..31', async () => {
    await expect(
      payrollSettingsService.updateSettings('tenant-1', { payDay: 32 }),
    ).rejects.toThrow('payDay must be a day-of-month between 1 and 31');
  });

  it('should reject a negative deduction amount', async () => {
    await expect(
      payrollSettingsService.updateSettings('tenant-1', { personalDeduction: '-1' }),
    ).rejects.toThrow('personalDeduction must be a non-negative amount');
  });

  it('should reject non-ascending tax bracket bounds', async () => {
    await expect(
      payrollSettingsService.updateSettings('tenant-1', {
        taxBrackets: [
          { upTo: 10_000_000, rate: 0.05 },
          { upTo: 5_000_000, rate: 0.1 },
          { upTo: null, rate: 0.2 },
        ],
      }),
    ).rejects.toThrow('tax bracket upTo bounds must strictly increase');
  });

  it('should reject a table whose final bracket is not open-ended', async () => {
    await expect(
      payrollSettingsService.updateSettings('tenant-1', {
        taxBrackets: [
          { upTo: 5_000_000, rate: 0.05 },
          { upTo: 10_000_000, rate: 0.1 },
        ],
      }),
    ).rejects.toThrow('the final tax bracket must be open-ended');
  });

  it('should reject a bracket rate above 1', async () => {
    await expect(
      payrollSettingsService.updateSettings('tenant-1', {
        taxBrackets: [{ upTo: null, rate: 1.5 }],
      }),
    ).rejects.toThrow('each tax bracket rate must be a fraction between 0 and 1');
  });

  it('should accept a valid update and persist it', async () => {
    const result = await payrollSettingsService.updateSettings('tenant-1', {
      socialInsuranceRate: 0.08,
      payDay: 7,
      taxBrackets: DEFAULT_BRACKETS,
    });

    expect(repoMock.update).toHaveBeenCalledOnce();
    expect(result.payDay).toBe(7);
  });

  it('should seed defaults first if no settings exist yet on update', async () => {
    repoMock.findByTenant.mockResolvedValue(null);
    repoMock.create.mockResolvedValue(makeSettings());

    await payrollSettingsService.updateSettings('tenant-1', { payDay: 9 });

    expect(repoMock.create).toHaveBeenCalledOnce();
    expect(repoMock.update).toHaveBeenCalledOnce();
  });
});
