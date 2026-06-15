import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import type { UserDto } from '@hrm/shared';
import { useAuthStore } from '@/stores/auth.store';
import i18n from '@/i18n';
import { RequirePermission } from './RequirePermission';

function makeUser(permissions: string[]): UserDto {
  return {
    id: 'u1',
    email: 'u1@example.com',
    fullName: 'User One',
    role: 'EMPLOYEE',
    roleId: 'role-1',
    permissions,
    status: 'ACTIVE',
    tenantId: 'tenant-1',
    employee: null,
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
  };
}

describe('RequirePermission', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
    i18n.changeLanguage('vi');
  });

  it('renders the guarded content when the permission is granted', () => {
    useAuthStore.setState({ user: makeUser(['employees:create']) });
    render(
      <RequirePermission permission="employees:create">
        <div>Create form</div>
      </RequirePermission>,
    );
    expect(screen.getByText('Create form')).toBeInTheDocument();
  });

  it('renders the 403 page when the permission is missing', () => {
    useAuthStore.setState({ user: makeUser(['employees:view']) });
    render(
      <RequirePermission permission="employees:create">
        <div>Create form</div>
      </RequirePermission>,
    );
    expect(screen.queryByText('Create form')).not.toBeInTheDocument();
    expect(screen.getByText('Không có quyền truy cập')).toBeInTheDocument();
  });
});
