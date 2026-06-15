import { create } from 'zustand';
import { type UserDto, PERMISSION_KEYS } from '@hrm/shared';
import { setAccessToken } from '@/lib/api-client';

interface AuthState {
  user: UserDto | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: UserDto | null, accessToken?: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

// DEV ONLY: auto-login as a full-permission mock user so the whole UI is
// visible while developing. Set VITE_DISABLE_DEV_AUTH=true to turn this off and
// hit the real login flow (needed to test role-based permissions).
const DEV_AUTH_DISABLED = import.meta.env.VITE_DISABLE_DEV_AUTH === 'true';
const DEV_MOCK_USER: UserDto | null =
  import.meta.env.DEV && !DEV_AUTH_DISABLED
    ? {
      id: 'dev-user-1',
      email: 'admin@codecrush.asia',
      fullName: 'Admin Dev',
      role: 'HR_MANAGER',
      roleId: 'dev-role-1',
      // Dev-only: grant every key so the full UI is visible while developing.
      permissions: [...PERMISSION_KEYS],
      status: 'ACTIVE',
      tenantId: 'tenant-1',
      employee: null,
      emailVerifiedAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }
  : null;

export const useAuthStore = create<AuthState>((set) => ({
  user: DEV_MOCK_USER,
  isAuthenticated: !!DEV_MOCK_USER,
  // Start in loading state (unless a dev mock user is already authenticated) so
  // ProtectedRoute shows a spinner — not a /login redirect — while
  // AuthInitializer's silent /auth/refresh restores a remembered session.
  isLoading: !DEV_MOCK_USER,

  setUser: (user, accessToken) => {
    if (accessToken) {
      setAccessToken(accessToken);
    }
    set({ user, isAuthenticated: !!user, isLoading: false });
  },

  logout: () => {
    setAccessToken(null);
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  setLoading: (isLoading) => set({ isLoading }),
}));
