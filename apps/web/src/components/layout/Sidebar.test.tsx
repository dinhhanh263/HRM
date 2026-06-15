import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { Sidebar } from './Sidebar';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSION_KEYS, type UserDto } from '@hrm/shared';

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
  useAuthStore.setState({ user: fullUser, isAuthenticated: true, isLoading: false });
});
afterEach(() => {
  useAuthStore.setState({ user: fullUser, isAuthenticated: true, isLoading: false });
});

describe('Sidebar', () => {
  it('renders all nav groups for a fully-permissioned user', () => {
    render(<Sidebar variant="desktop" />);
    expect(screen.getByText('Tổng quan')).toBeInTheDocument();
    expect(screen.getByText('Quản lý nhân sự')).toBeInTheDocument();
    expect(screen.getByText('Nhân viên')).toBeInTheDocument();
    expect(screen.getByText('Vai trò & quyền')).toBeInTheDocument();
  });

  it('filters nav items by permission', () => {
    useAuthStore.setState({
      user: { ...fullUser, permissions: ['dashboard:view'] } as unknown as UserDto,
    });
    render(<Sidebar variant="desktop" />);
    expect(screen.getByText('Tổng quan')).toBeInTheDocument();
    expect(screen.queryByText('Quản lý nhân sự')).not.toBeInTheDocument();
    expect(screen.queryByText('Nhân viên')).not.toBeInTheDocument();
  });

  it('shows the Assets nav item when the user holds assets:view', () => {
    useAuthStore.setState({
      user: { ...fullUser, permissions: ['assets:view'] } as unknown as UserDto,
    });
    render(<Sidebar variant="desktop" />);
    expect(screen.getByText('Tài sản')).toBeInTheDocument();
  });

  it('hides the Assets nav item when the user lacks assets:view', () => {
    useAuthStore.setState({
      user: { ...fullUser, permissions: ['dashboard:view'] } as unknown as UserDto,
    });
    render(<Sidebar variant="desktop" />);
    expect(screen.queryByText('Tài sản')).not.toBeInTheDocument();
    expect(screen.queryByText('Loại tài sản')).not.toBeInTheDocument();
  });

  it('calls onToggleCollapse from the desktop collapse button', async () => {
    const onToggleCollapse = vi.fn();
    render(<Sidebar variant="desktop" onToggleCollapse={onToggleCollapse} />);
    await userEvent.click(screen.getByRole('button', { name: /Thu gọn/i }));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('calls onClose from the mobile close button', async () => {
    const onClose = vi.fn();
    render(<Sidebar variant="mobile" open onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /Đóng/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
