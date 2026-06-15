import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { UserDto } from '@hrm/shared';
import { AuthInitializer } from './AuthInitializer';
import { useAuthStore } from '@/stores/auth.store';
import { markLogin } from '@/lib/session-persistence';

const { get, refreshAccessToken, setAccessToken } = vi.hoisted(() => ({
  get: vi.fn(),
  refreshAccessToken: vi.fn(),
  setAccessToken: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { get },
  refreshAccessToken,
  setAccessToken,
  getAccessToken: vi.fn(),
}));

const user = {
  id: 'u1',
  email: 'admin@codecrush.asia',
  fullName: 'Admin',
  role: 'HR_MANAGER',
  roleId: 'r1',
  permissions: [],
  status: 'ACTIVE',
  tenantId: 't1',
  emailVerifiedAt: null,
  lastLoginAt: null,
  createdAt: new Date().toISOString(),
} as unknown as UserDto;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true });
});

describe('AuthInitializer', () => {
  it('renders its children', () => {
    markLogin(true);
    refreshAccessToken.mockResolvedValue('tok');
    get.mockResolvedValue({ data: { data: user } });
    render(
      <AuthInitializer>
        <div>Nội dung con</div>
      </AuthInitializer>
    );
    expect(screen.getByText('Nội dung con')).toBeInTheDocument();
  });

  it('hydrates the auth store when the session refresh succeeds', async () => {
    markLogin(true);
    refreshAccessToken.mockResolvedValue('tok-123');
    get.mockResolvedValue({ data: { data: user } });

    render(
      <AuthInitializer>
        <div>app</div>
      </AuthInitializer>
    );

    await waitFor(() => {
      expect(useAuthStore.getState().user).toEqual(user);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });
    expect(refreshAccessToken).toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith('/auth/me', {
      headers: { Authorization: 'Bearer tok-123' },
    });
  });

  it('stops loading and stays unauthenticated when refresh fails', async () => {
    markLogin(true);
    refreshAccessToken.mockRejectedValue(new Error('no session'));

    render(
      <AuthInitializer>
        <div>app</div>
      </AuthInitializer>
    );

    await waitFor(() => expect(useAuthStore.getState().isLoading).toBe(false));
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  // A session-only login that the browser kept alive (lingering cookie) must NOT
  // auto-resume after the browser session ended — no persistence marker means we
  // never even attempt the silent refresh.
  it('skips the silent refresh and stays unauthenticated when no session marker exists', async () => {
    refreshAccessToken.mockResolvedValue('tok');

    render(
      <AuthInitializer>
        <div>app</div>
      </AuthInitializer>
    );

    await waitFor(() => expect(useAuthStore.getState().isLoading).toBe(false));
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
