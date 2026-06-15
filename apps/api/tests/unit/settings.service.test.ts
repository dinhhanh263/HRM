import { describe, it, expect, vi, beforeEach } from 'vitest';

// SPEC-036 — tenant settings service: per-section defaults, shallow merge that
// never clobbers other features' keys in Tenant.settings, Zod-validated PATCH.

const tenantSettingsRepoMock = {
  getSettings: vi.fn(),
  mergeSettings: vi.fn(),
};
const settingsRepoMock = {
  countActiveUsers: vi.fn(),
  insertAudit: vi.fn(),
  listAudit: vi.fn(),
};

vi.mock('../../src/domain/repositories/tenant-settings.repository.js', () => ({
  tenantSettingsRepository: tenantSettingsRepoMock,
}));
vi.mock('../../src/domain/repositories/settings.repository.js', () => ({
  settingsRepository: settingsRepoMock,
}));

const { settingsService } = await import('../../src/domain/services/settings.service.js');

describe('settingsService.getSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantSettingsRepoMock.getSettings.mockResolvedValue({});
    settingsRepoMock.countActiveUsers.mockResolvedValue(12);
  });

  it('returns full defaults when nothing is stored', async () => {
    const data = await settingsService.getSettings('t-1');

    expect(data.company).toEqual({ name: '', address: '', taxCode: '', contactEmail: '', phone: '' });
    expect(data.notifications).toEqual({ probationLeadDays: 7, contractLeadDays: 30 });
    expect(data.regional).toEqual({ defaultLanguage: 'vi', weekStart: 'mon' });
    expect(data.security).toEqual({ passwordMinLength: 8, forceSso: false });
    expect(data.plan).toEqual({ name: 'Internal', seatLimit: null, seatsUsed: 12 });
  });

  it('merges stored values over defaults per section', async () => {
    tenantSettingsRepoMock.getSettings.mockResolvedValue({
      company: { name: 'CodeCrush' },
      notifications: { probationLeadDays: 14 },
      payroll: { irrelevant: true }, // key của feature khác — bị bỏ qua, không lỗi
    });

    const data = await settingsService.getSettings('t-1');

    expect(data.company.name).toBe('CodeCrush');
    expect(data.company.taxCode).toBe(''); // default giữ nguyên cho field thiếu
    expect(data.notifications).toEqual({ probationLeadDays: 14, contractLeadDays: 30 });
    expect(data.regional.weekStart).toBe('mon');
  });
});

describe('settingsService.getPublicSettings', () => {
  it('exposes only regional defaults and the forceSso flag — never the full security section', async () => {
    tenantSettingsRepoMock.getSettings.mockResolvedValue({
      regional: { weekStart: 'sun' },
      security: { forceSso: true, passwordMinLength: 16 },
    });

    const data = await settingsService.getPublicSettings('t-1');

    expect(data).toEqual({
      regional: { defaultLanguage: 'vi', weekStart: 'sun' },
      security: { forceSso: true }, // passwordMinLength không lộ ra
    });
  });
});

describe('settingsService.patchSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantSettingsRepoMock.getSettings.mockResolvedValue({});
    tenantSettingsRepoMock.mergeSettings.mockResolvedValue({});
    settingsRepoMock.countActiveUsers.mockResolvedValue(1);
    settingsRepoMock.insertAudit.mockResolvedValue(undefined);
  });

  it('merges a partial patch over the stored section and writes only that key', async () => {
    tenantSettingsRepoMock.getSettings.mockResolvedValue({
      company: { name: 'Old Name', taxCode: '123' },
    });

    await settingsService.patchSection('t-1', 'u-1', 'company', { name: 'New Name' });

    expect(tenantSettingsRepoMock.mergeSettings).toHaveBeenCalledWith('t-1', {
      company: expect.objectContaining({ name: 'New Name', taxCode: '123' }),
    });
    // Chỉ key `company` được ghi — key feature khác không xuất hiện trong patch.
    const patch = tenantSettingsRepoMock.mergeSettings.mock.calls[0][1];
    expect(Object.keys(patch)).toEqual(['company']);
  });

  it('rejects invalid values with a validation error', async () => {
    await expect(
      settingsService.patchSection('t-1', 'u-1', 'notifications', { probationLeadDays: 0 }),
    ).rejects.toMatchObject({ statusCode: 422 });

    await expect(
      settingsService.patchSection('t-1', 'u-1', 'company', { contactEmail: 'not-an-email' }),
    ).rejects.toMatchObject({ statusCode: 422 });

    await expect(
      settingsService.patchSection('t-1', 'u-1', 'security', { passwordMinLength: 4 }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('rejects an unknown section', async () => {
    await expect(
      settingsService.patchSection('t-1', 'u-1', 'plan', { name: 'Hack' }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('records an audit entry with the changed fields', async () => {
    tenantSettingsRepoMock.getSettings.mockResolvedValue({ company: { name: 'Old' } });

    await settingsService.patchSection('t-1', 'u-9', 'company', { name: 'New' });

    expect(settingsRepoMock.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't-1',
        userId: 'u-9',
        section: 'company',
        changes: expect.objectContaining({
          name: { from: 'Old', to: 'New' },
        }),
      }),
    );
  });
});
