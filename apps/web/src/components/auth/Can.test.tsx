import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { UserDto } from '@hrm/shared';
import { useAuthStore } from '@/stores/auth.store';
import { Can } from './Can';

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

describe('Can', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
  });

  it('renders children when the single permission is granted', () => {
    useAuthStore.setState({ user: makeUser(['employees:create']) });
    render(
      <Can permission="employees:create">
        <button>Add</button>
      </Can>,
    );
    expect(screen.getByText('Add')).toBeInTheDocument();
  });

  it('renders nothing when the permission is missing', () => {
    useAuthStore.setState({ user: makeUser(['employees:view']) });
    render(
      <Can permission="employees:create">
        <button>Add</button>
      </Can>,
    );
    expect(screen.queryByText('Add')).not.toBeInTheDocument();
  });

  it('renders the fallback when the permission is missing', () => {
    useAuthStore.setState({ user: makeUser(['employees:view']) });
    render(
      <Can permission="employees:create" fallback={<span>No access</span>}>
        <button>Add</button>
      </Can>,
    );
    expect(screen.queryByText('Add')).not.toBeInTheDocument();
    expect(screen.getByText('No access')).toBeInTheDocument();
  });

  it('with anyOf renders children when at least one key is granted', () => {
    useAuthStore.setState({ user: makeUser(['employees:export']) });
    render(
      <Can anyOf={['employees:create', 'employees:export']}>
        <button>Export</button>
      </Can>,
    );
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('with allOf renders nothing unless every key is granted', () => {
    useAuthStore.setState({ user: makeUser(['employees:view']) });
    render(
      <Can allOf={['employees:view', 'employees:update']}>
        <button>Edit</button>
      </Can>,
    );
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });
});
