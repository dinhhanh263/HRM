import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import type { TenantSettingsDto, SettingsAuditEntry } from '@hrm/shared';
import { SettingsPage } from './pages/SettingsPage';

// SPEC-036 — settings center: hub cards gated by permission, per-section forms
// PATCH their own section, plan is read-only, audit table lists changes.

let mockPermissions: string[] = [];
const mutateMock = vi.fn();
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (s: { user: unknown }) => unknown) => {
    const state = {
      user: { id: 'u', fullName: 'HR', email: 'hr@e.com', permissions: mockPermissions },
    };
    return selector ? selector(state) : state;
  },
}));

const settings: TenantSettingsDto = {
  company: { name: 'CodeCrush', address: '', taxCode: '0312345678', contactEmail: '', phone: '' },
  notifications: { probationLeadDays: 7, contractLeadDays: 30 },
  regional: { defaultLanguage: 'vi', weekStart: 'mon' },
  security: { passwordMinLength: 8, forceSso: false },
  plan: { name: 'Internal', seatLimit: null, seatsUsed: 38 },
};

const audit: SettingsAuditEntry[] = [
  {
    id: 'a-1',
    section: 'company',
    changes: { name: { from: 'Old', to: 'CodeCrush' } },
    changedBy: { id: 'u-1', fullName: 'Đinh Văn Hạnh' },
    createdAt: '2026-06-11T08:00:00.000Z',
  },
];

vi.mock('./hooks/useSettings', () => ({
  useTenantSettings: () => ({ data: settings, isLoading: false, isError: false }),
  useSettingsAudit: () => ({ data: audit, isLoading: false }),
  useUpdateSettings: () => ({ mutate: mutateMock, isPending: false }),
}));

describe('SettingsPage (SPEC-036)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions = ['settings:view', 'settings:update', 'roles:view'];
  });

  it('shows hub cards only for permitted areas', () => {
    render(<SettingsPage />);
    // roles:view có → card hiện; timesheet:view không có → ẩn.
    expect(screen.getByText('Vai trò & quyền')).toBeInTheDocument();
    expect(screen.queryByText('Chấm công')).not.toBeInTheDocument();
  });

  it('navigates from a hub card to its settings area', async () => {
    render(<SettingsPage />);
    await userEvent.click(screen.getByText('Vai trò & quyền'));
    expect(mockNavigate).toHaveBeenCalledWith('/settings/roles');
  });

  it('renders stored company values and PATCHes only the company section on save', async () => {
    render(<SettingsPage />);

    const nameInput = screen.getByLabelText('Tên công ty');
    expect(nameInput).toHaveValue('CodeCrush');

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'CodeCrush JSC');
    const companySave = screen.getAllByRole('button', { name: 'Lưu thay đổi' })[0];
    await userEvent.click(companySave);

    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        section: 'company',
        payload: expect.objectContaining({ name: 'CodeCrush JSC' }),
      }),
      expect.anything(),
    );
  });

  it('shows plan info read-only with active seats', () => {
    render(<SettingsPage />);
    expect(screen.getByText('38')).toBeInTheDocument();
    expect(screen.getByText('Không giới hạn')).toBeInTheDocument();
  });

  it('renders the audit table with author and section', () => {
    render(<SettingsPage />);
    const table = screen.getByRole('table');
    expect(within(table).getByText('Đinh Văn Hạnh')).toBeInTheDocument();
    expect(within(table).getByText('Hồ sơ công ty')).toBeInTheDocument();
  });

  it('hides save buttons without settings:update', () => {
    mockPermissions = ['settings:view'];
    render(<SettingsPage />);
    expect(screen.queryByRole('button', { name: 'Lưu thay đổi' })).not.toBeInTheDocument();
  });
});
