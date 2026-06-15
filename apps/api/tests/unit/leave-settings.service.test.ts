import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMock = {
  getSettings: vi.fn(),
  mergeSettings: vi.fn(),
};

vi.mock('../../src/domain/repositories/tenant-settings.repository.js', () => ({
  tenantSettingsRepository: repoMock,
}));

const { leaveSettingsService } = await import(
  '../../src/domain/services/leave-settings.service.js'
);

describe('leaveSettingsService.getProRata', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to false when the tenant has no leave settings', async () => {
    repoMock.getSettings.mockResolvedValue({});

    const result = await leaveSettingsService.getProRata('tenant-1');

    expect(result).toEqual({ proRataEnabled: false });
  });

  it('defaults to false when leaveProrata key is absent but other keys exist', async () => {
    repoMock.getSettings.mockResolvedValue({ payroll: { foo: 1 } });

    const result = await leaveSettingsService.getProRata('tenant-1');

    expect(result.proRataEnabled).toBe(false);
  });

  it('reflects a persisted enabled flag', async () => {
    repoMock.getSettings.mockResolvedValue({ leaveProrata: { enabled: true } });

    const result = await leaveSettingsService.getProRata('tenant-1');

    expect(result.proRataEnabled).toBe(true);
  });

  it('coerces a non-boolean stored value to a strict boolean', async () => {
    repoMock.getSettings.mockResolvedValue({ leaveProrata: { enabled: 'yes' } });

    const result = await leaveSettingsService.getProRata('tenant-1');

    expect(result.proRataEnabled).toBe(false);
  });
});

describe('leaveSettingsService.setProRata', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merges the flag under the leaveProrata key and returns the new state', async () => {
    repoMock.mergeSettings.mockResolvedValue({ leaveProrata: { enabled: true } });

    const result = await leaveSettingsService.setProRata('tenant-1', true);

    expect(repoMock.mergeSettings).toHaveBeenCalledWith('tenant-1', {
      leaveProrata: { enabled: true },
    });
    expect(result).toEqual({ proRataEnabled: true });
  });

  it('can turn the flag back off', async () => {
    repoMock.mergeSettings.mockResolvedValue({ leaveProrata: { enabled: false } });

    const result = await leaveSettingsService.setProRata('tenant-1', false);

    expect(repoMock.mergeSettings).toHaveBeenCalledWith('tenant-1', {
      leaveProrata: { enabled: false },
    });
    expect(result.proRataEnabled).toBe(false);
  });
});
