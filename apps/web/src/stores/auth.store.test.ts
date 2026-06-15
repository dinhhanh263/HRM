import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserDto } from '@hrm/shared';
import { useAuthStore } from './auth.store';
import { getAccessToken, setAccessToken } from '@/lib/api-client';

const user: UserDto = {
  id: 'u1',
  email: 'a@b.com',
  fullName: 'Test User',
  role: 'EMPLOYEE',
  roleId: 'r1',
  permissions: ['employees:view'],
  status: 'ACTIVE',
  tenantId: 't1',
  employee: null,
  emailVerifiedAt: null,
  lastLoginAt: null,
  createdAt: new Date().toISOString(),
};

describe('useAuthStore', () => {
  beforeEach(() => {
    setAccessToken(null);
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
  });

  it('setUser stores the user and marks authenticated', () => {
    useAuthStore.getState().setUser(user);
    const s = useAuthStore.getState();
    expect(s.user).toEqual(user);
    expect(s.isAuthenticated).toBe(true);
    expect(s.isLoading).toBe(false);
  });

  it('setUser with an access token forwards it to the api client', () => {
    useAuthStore.getState().setUser(user, 'tok-123');
    expect(getAccessToken()).toBe('tok-123');
  });

  it('setUser(null) clears authentication', () => {
    useAuthStore.getState().setUser(user);
    useAuthStore.getState().setUser(null);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('logout clears user and the access token', () => {
    useAuthStore.getState().setUser(user, 'tok-123');
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(getAccessToken()).toBeNull();
  });

  it('setLoading toggles the loading flag', () => {
    useAuthStore.getState().setLoading(true);
    expect(useAuthStore.getState().isLoading).toBe(true);
  });

  // Regression: without a dev mock user the app must attempt a silent session
  // restore on boot. If the store started unauthenticated AND not-loading,
  // ProtectedRoute would redirect to /login before AuthInitializer's
  // /auth/refresh resolves — silently defeating "remember me".
  it('boots in loading state when there is no dev mock user', async () => {
    vi.stubEnv('DEV', false);
    vi.resetModules();
    const { useAuthStore: freshStore } = await import('./auth.store');
    const s = freshStore.getState();
    expect(s.user).toBeNull();
    expect(s.isAuthenticated).toBe(false);
    expect(s.isLoading).toBe(true);
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
