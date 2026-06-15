import { describe, it, expect, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { render, waitFor } from '@testing-library/react';
import type { AxiosAdapter } from 'axios';
import { AuthInitializer } from './AuthInitializer';
import { apiClient, setAccessToken } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { markLogin } from '@/lib/session-persistence';

// Integration test (no api-client mock): drives the real refresh dedup through a
// custom axios adapter so we can reproduce the boot-time race.
//
// Regression: React StrictMode double-invokes effects in dev, so AuthInitializer's
// silent /auth/refresh fired twice with the same cookie. Refresh tokens are
// single-use (server rotates + revokes on each call), so the second concurrent
// refresh hit a revoked token and 401'd — bouncing a "remembered" user to /login
// even though their persistent cookie was valid. The boot refresh must go through
// the shared refreshAccessToken() mutex so the double-invoke collapses to ONE call.

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
};

beforeEach(() => {
  setAccessToken(null);
  localStorage.clear();
  sessionStorage.clear();
  // A remembered ("remember me") login so the boot guard attempts the refresh.
  markLogin(true);
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true });
});

function reject401(config: unknown) {
  const error = new Error('Request failed with status code 401') as Error & {
    response: { status: number; data: unknown };
    config: unknown;
  };
  error.response = { status: 401, data: {} };
  error.config = config;
  return error;
}

describe('AuthInitializer boot refresh (StrictMode double-invoke)', () => {
  it('issues exactly one /auth/refresh and stays authenticated despite single-use rotation', async () => {
    let refreshCount = 0;
    const adapter: AxiosAdapter = async (config) => {
      if (config.url?.includes('/auth/refresh')) {
        refreshCount += 1;
        // Single-use token: only the first call succeeds; a concurrent second 401s.
        if (refreshCount > 1) throw reject401(config);
        return {
          data: { success: true, data: { accessToken: 'fresh-token' } },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (config.url?.includes('/auth/me')) {
        return {
          data: { success: true, data: user },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      throw reject401(config);
    };
    apiClient.defaults.adapter = adapter;

    render(
      <StrictMode>
        <AuthInitializer>
          <div>app</div>
        </AuthInitializer>
      </StrictMode>
    );

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });
    expect(useAuthStore.getState().user).toMatchObject({ email: 'admin@codecrush.asia' });
    // Without the shared mutex the StrictMode double-invoke fires 2 refreshes and
    // the second 401s, defeating "remember me".
    expect(refreshCount).toBe(1);
  });
});
