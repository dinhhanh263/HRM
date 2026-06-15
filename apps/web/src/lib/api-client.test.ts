import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AxiosAdapter } from 'axios';
import { apiClient, setAccessToken } from './api-client';

// Drive the interceptor by swapping in a custom adapter that records every
// outgoing request and lets each test decide the response per URL.
function installAdapter(handler: AxiosAdapter) {
  apiClient.defaults.adapter = handler;
}

function reject401() {
  const error = new Error('Request failed with status code 401') as Error & {
    response: { status: number; data: unknown };
  };
  error.response = { status: 401, data: {} };
  return error;
}

describe('apiClient refresh interceptor', () => {
  beforeEach(() => {
    setAccessToken(null);
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: '' } as Location,
    });
  });

  it('does not loop when the refresh call itself returns 401', async () => {
    const calls: string[] = [];
    installAdapter(async (config) => {
      calls.push(config.url ?? '');
      // Every endpoint — including /auth/refresh — is unauthenticated.
      throw Object.assign(reject401(), { config });
    });

    await expect(apiClient.get('/employees')).rejects.toBeTruthy();

    // The original request + exactly one refresh attempt. No recursion.
    expect(calls.filter((u) => u.includes('/auth/refresh'))).toHaveLength(1);
    expect(window.location.href).toBe('/login');
  });

  it('retries the original request once after a successful refresh', async () => {
    const calls: string[] = [];
    installAdapter(async (config) => {
      calls.push(config.url ?? '');
      if (config.url?.includes('/auth/refresh')) {
        return {
          data: { success: true, data: { accessToken: 'fresh-token' } },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      // First hit (no X-Retry) → 401; retry (with X-Retry) → 200.
      if (config.headers?.['X-Retry']) {
        return {
          data: { success: true, data: { id: 'e1' } },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      throw Object.assign(reject401(), { config });
    });

    const res = await apiClient.get('/employees');

    expect(res.status).toBe(200);
    expect(calls.filter((u) => u.includes('/auth/refresh'))).toHaveLength(1);
    expect(calls.filter((u) => u.includes('/employees'))).toHaveLength(2);
  });

  it('shares one refresh across concurrent 401s (rotating refresh tokens)', async () => {
    const calls: string[] = [];
    let refreshCount = 0;
    installAdapter(async (config) => {
      calls.push(config.url ?? '');
      if (config.url?.includes('/auth/refresh')) {
        refreshCount += 1;
        // Single-use refresh token: only the first call succeeds, mirroring the
        // server revoking the token on rotation. A second concurrent refresh 401s.
        if (refreshCount > 1) {
          throw Object.assign(reject401(), { config });
        }
        return {
          data: { success: true, data: { accessToken: 'fresh-token' } },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (config.headers?.['X-Retry']) {
        return {
          data: { success: true, data: {} },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      throw Object.assign(reject401(), { config });
    });

    // The Leave page fires these three in parallel; all start unauthenticated.
    const results = await Promise.all([
      apiClient.get('/leave/types'),
      apiClient.get('/leave/balances'),
      apiClient.get('/leave/requests'),
    ]);

    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    // Without the mutex this would be 3 → two of them hit a revoked token.
    expect(calls.filter((u) => u.includes('/auth/refresh'))).toHaveLength(1);
    expect(window.location.href).toBe('');
  });
});
