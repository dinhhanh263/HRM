import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import type { MyAccountDto, MySessionDto } from '@hrm/shared';
import { AccountPage } from './pages/AccountPage';

// SPEC-037 — my-account page: tab routing via ?tab=, self-editable fields only,
// password form honours forceSso, sessions list with revoke-others.

let mockRole = 'EMPLOYEE';
let mockForceSso = false;
const profileMutate = vi.fn();
const passwordMutate = vi.fn();
const revokeMutate = vi.fn();
const prefsMutate = vi.fn();

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (s: { user: unknown }) => unknown) => {
    const state = {
      user: { id: 'u', fullName: 'Nhân Viên A', email: 'a@e.com', role: mockRole, permissions: [] },
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/features/settings/hooks/useSettings', () => ({
  usePublicSettings: () => ({
    data: { regional: { defaultLanguage: 'vi', weekStart: 'mon' }, security: { forceSso: mockForceSso } },
  }),
}));

const account: MyAccountDto = {
  user: {
    id: 'u',
    fullName: 'Nhân Viên A',
    email: 'a@e.com',
    role: 'EMPLOYEE',
    lastLoginAt: '2026-06-12T01:00:00.000Z',
  },
  employee: {
    id: 'emp-1',
    employeeCode: 'ACC-1',
    departmentName: 'Engineering',
    positionName: 'Developer',
    joinDate: '2025-01-06T00:00:00.000Z',
    phone: '0901234567',
    avatar: null,
  },
  googleLinkedAt: null,
  notificationPrefs: { probation_ending: false },
};

const sessions: MySessionDto[] = [
  {
    id: 's-1',
    device: 'Chrome · macOS',
    createdAt: '2026-06-12T01:00:00.000Z',
    lastUsedAt: null,
    persistent: true,
    current: true,
  },
  {
    id: 's-2',
    device: 'Firefox · Windows',
    createdAt: '2026-06-10T01:00:00.000Z',
    lastUsedAt: '2026-06-11T09:00:00.000Z',
    persistent: true,
    current: false,
  },
];

vi.mock('./hooks/useAccount', () => ({
  useMyAccount: () => ({ data: account, isLoading: false, isError: false }),
  useMySessions: () => ({ data: sessions, isLoading: false }),
  useUpdateMyProfile: () => ({ mutate: profileMutate, isPending: false }),
  useChangePassword: () => ({ mutate: passwordMutate, isPending: false }),
  useRevokeOtherSessions: () => ({ mutate: revokeMutate, isPending: false }),
  useUpdateNotificationPrefs: () => ({ mutate: prefsMutate, isPending: false }),
}));

describe('AccountPage (SPEC-037)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRole = 'EMPLOYEE';
    mockForceSso = false;
    window.history.pushState({}, '', '/account');
  });

  it('shows the profile tab by default with HR-managed info read-only', () => {
    render(<AccountPage />);
    expect(screen.getByText('ACC-1')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    // Họ tên là text tĩnh, không phải input.
    expect(screen.queryByLabelText('Họ và tên')).not.toBeInTheDocument();
  });

  it('opens the security tab from ?tab=security', () => {
    window.history.pushState({}, '', '/account?tab=security');
    render(<AccountPage />);
    expect(screen.getByRole('heading', { name: 'Đổi mật khẩu' })).toBeInTheDocument();
  });

  it('saves the editable profile fields', async () => {
    render(<AccountPage />);

    const phone = screen.getByLabelText('Số điện thoại');
    await userEvent.clear(phone);
    await userEvent.type(phone, '0999888777');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(profileMutate).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '0999888777' }),
      expect.anything(),
    );
  });

  it('submits a password change only when the confirmation matches', async () => {
    window.history.pushState({}, '', '/account?tab=security');
    render(<AccountPage />);

    await userEvent.type(screen.getByLabelText('Mật khẩu hiện tại'), 'OldPass@123');
    await userEvent.type(screen.getByLabelText('Mật khẩu mới'), 'NewPass@456');
    await userEvent.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'Different@789');
    await userEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    expect(passwordMutate).not.toHaveBeenCalled();
    expect(screen.getByText('Mật khẩu nhập lại không khớp')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Nhập lại mật khẩu mới'));
    await userEvent.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'NewPass@456');
    await userEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    expect(passwordMutate).toHaveBeenCalledWith(
      { currentPassword: 'OldPass@123', newPassword: 'NewPass@456' },
      expect.anything(),
    );
  });

  it('hides the password form when the tenant forces SSO (non-SUPER_ADMIN)', () => {
    mockForceSso = true;
    window.history.pushState({}, '', '/account?tab=security');
    render(<AccountPage />);

    expect(screen.queryByLabelText('Mật khẩu hiện tại')).not.toBeInTheDocument();
    expect(
      screen.getByText(/bắt buộc đăng nhập SSO/i, { exact: false })
    ).toBeInTheDocument();
  });

  it('lists sessions with the current badge and revokes the others', async () => {
    window.history.pushState({}, '', '/account?tab=security');
    render(<AccountPage />);

    expect(screen.getByText('Chrome · macOS')).toBeInTheDocument();
    expect(screen.getByText('Phiên này')).toBeInTheDocument();
    expect(screen.getByText('Firefox · Windows')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất các thiết bị khác' }));
    // AlertDialog confirm — nút "Đăng xuất" (exact, không match nút trigger dài hơn)
    const confirm = await screen.findByRole('button', { name: 'Đăng xuất' });
    await userEvent.click(confirm);
    expect(revokeMutate).toHaveBeenCalled();
  });

  it('toggles an email preference', async () => {
    window.history.pushState({}, '', '/account?tab=notifications');
    render(<AccountPage />);

    // probation_ending đang tắt (prefs false) → checkbox unchecked.
    const probation = screen.getByRole('checkbox', { name: /Sắp hết hạn thử việc/ });
    expect(probation).not.toBeChecked();

    const contract = screen.getByRole('checkbox', { name: /Sắp hết hạn hợp đồng/ });
    await userEvent.click(contract);
    expect(prefsMutate).toHaveBeenCalledWith({ contract_expiring: false });
  });
});
