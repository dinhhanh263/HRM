import { useState } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/test-utils';
import { CommandPalette } from './CommandPalette';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSION_KEYS, type UserDto } from '@hrm/shared';

const fullUser = {
  id: 'u1',
  email: 'admin@codecrush.asia',
  fullName: 'Super Admin',
  role: 'HR_MANAGER',
  roleId: 'r1',
  permissions: [...PERMISSION_KEYS],
  status: 'ACTIVE',
  tenantId: 't1',
} as unknown as UserDto;

/** Stateful harness so we can exercise the global ⌘K shortcut. */
function Harness() {
  const [open, setOpen] = useState(false);
  return <CommandPalette open={open} onOpenChange={setOpen} />;
}

beforeEach(() => {
  useAuthStore.setState({ user: fullUser, isAuthenticated: true, isLoading: false });
  window.history.pushState({}, '', '/');
});

describe('CommandPalette', () => {
  it('opens on ⌘/Ctrl+K and shows recruitment actions', async () => {
    render(<Harness />);
    // Closed initially.
    expect(screen.queryByPlaceholderText('Tìm trang hoặc hành động...')).not.toBeInTheDocument();

    await userEvent.keyboard('{Control>}k{/Control}');

    expect(screen.getByPlaceholderText('Tìm trang hoặc hành động...')).toBeInTheDocument();
    expect(screen.getByText('Tạo tin tuyển dụng')).toBeInTheDocument();
    expect(screen.getByText('Thêm ứng viên')).toBeInTheDocument();
  });

  it('filters diacritic- and case-insensitively', async () => {
    render(<CommandPalette open onOpenChange={() => {}} />);
    await userEvent.type(
      screen.getByPlaceholderText('Tìm trang hoặc hành động...'),
      'tuyen dung'
    );
    expect(screen.getByText('Tạo tin tuyển dụng')).toBeInTheDocument();
    // An unrelated entry is filtered out.
    expect(screen.queryByText('Nhân viên')).not.toBeInTheDocument();
  });

  it('hides recruitment actions when the user lacks permission', () => {
    useAuthStore.setState({
      user: { ...fullUser, permissions: ['dashboard:view'] } as unknown as UserDto,
    });
    render(<CommandPalette open onOpenChange={() => {}} />);
    expect(screen.queryByText('Tạo tin tuyển dụng')).not.toBeInTheDocument();
    expect(screen.queryByText('Thêm ứng viên')).not.toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('navigates to the selected command on Enter', async () => {
    render(<CommandPalette open onOpenChange={() => {}} />);
    await userEvent.type(
      screen.getByPlaceholderText('Tìm trang hoặc hành động...'),
      'tim ung vien'
    );
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(window.location.pathname).toBe('/recruitment/candidates'));
  });

  it('shows an empty state when nothing matches', async () => {
    render(<CommandPalette open onOpenChange={() => {}} />);
    await userEvent.type(
      screen.getByPlaceholderText('Tìm trang hoặc hành động...'),
      'zzzzzzz'
    );
    expect(screen.getByText('Không có kết quả')).toBeInTheDocument();
  });
});
