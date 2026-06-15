import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { AppLayout } from './AppLayout';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSION_KEYS, type UserDto } from '@hrm/shared';

const logoutMutate = vi.fn();
vi.mock('@/features/auth/hooks/useAuth', () => ({
  useLogout: () => ({ mutate: logoutMutate, isPending: false }),
}));

const fullUser = {
  id: 'u1',
  email: 'admin@codecrush.asia',
  fullName: 'Admin Dev',
  role: 'HR_MANAGER',
  roleId: 'r1',
  permissions: [...PERMISSION_KEYS],
  status: 'ACTIVE',
  tenantId: 't1',
} as unknown as UserDto;

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: fullUser, isAuthenticated: true, isLoading: false });
});
afterEach(() => {
  useAuthStore.setState({ user: fullUser, isAuthenticated: true, isLoading: false });
});

describe('AppLayout', () => {
  it('renders the breadcrumb home link and the current user', () => {
    render(<AppLayout />);
    expect(screen.getByText('Trang chủ')).toBeInTheDocument();
    expect(screen.getByText('Dev')).toBeInTheDocument();
  });

  it('calls logout from the user menu', async () => {
    render(<AppLayout />);
    await userEvent.click(screen.getByRole('button', { name: /Dev/ }));
    await userEvent.click(await screen.findByText('Đăng xuất'));
    expect(logoutMutate).toHaveBeenCalled();
  });
});
