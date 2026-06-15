import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';

// SPEC-038: brute-force protection on auth endpoints — 5 req / 15 min keyed by
// (route, IP, email). No DB seeding needed: the limiter sits before validate/
// controller, so wrong-credential attempts against a nonexistent tenant still count.
const TENANT_SLUG = 'rate-limit-tenant';
const PASSWORD = 'Wrong@123';

function attemptLogin(email: string) {
  return request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD, tenantSlug: TENANT_SLUG });
}

describe('Auth rate limiting (SPEC-038)', () => {
  // .env.test disables the limiter globally; this suite is the one place it runs.
  // The skip() option reads process.env per-request, so toggling here is enough.
  beforeAll(() => {
    process.env.RATE_LIMIT_DISABLED = 'false';
  });

  afterAll(() => {
    process.env.RATE_LIMIT_DISABLED = 'true';
  });

  it('should return 429 with RATE_LIMITED error shape on the 6th login attempt', async () => {
    const email = 'blocked@rate-limit.test';

    for (let i = 0; i < 5; i++) {
      const res = await attemptLogin(email);
      expect(res.status, `attempt ${i + 1} must not be rate limited`).not.toBe(429);
    }

    const res = await attemptLogin(email);
    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.body.error.message).toBeTruthy();
  });

  it('should not block a different email from the same IP (shared-office NAT)', async () => {
    const blocked = 'blocked-2@rate-limit.test';
    for (let i = 0; i < 6; i++) {
      await attemptLogin(blocked);
    }
    expect((await attemptLogin(blocked)).status).toBe(429);

    const res = await attemptLogin('colleague@rate-limit.test');
    expect(res.status).not.toBe(429);
  });

  it('should rate limit forgot-password independently from login', async () => {
    const email = 'forgot@rate-limit.test';

    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email, tenantSlug: TENANT_SLUG });
      expect(res.status, `attempt ${i + 1} must not be rate limited`).not.toBe(429);
    }

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email, tenantSlug: TENANT_SLUG });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');

    // Same email on /login has its own bucket — route is part of the key.
    expect((await attemptLogin(email)).status).not.toBe(429);
  });

  it('should key reset-password by token, not IP alone (bulk-onboarding offices)', async () => {
    const attemptReset = (token: string) =>
      request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'NewPass@123' });

    for (let i = 0; i < 6; i++) {
      await attemptReset('aaaa-same-token');
    }
    expect((await attemptReset('aaaa-same-token')).status).toBe(429);

    // A colleague resetting with their own token from the same IP is unaffected.
    expect((await attemptReset('bbbb-other-token')).status).not.toBe(429);
  });

  it('should skip the limiter when RATE_LIMIT_DISABLED=true', async () => {
    process.env.RATE_LIMIT_DISABLED = 'true';
    try {
      const email = 'disabled@rate-limit.test';
      for (let i = 0; i < 8; i++) {
        const res = await attemptLogin(email);
        expect(res.status).not.toBe(429);
      }
    } finally {
      process.env.RATE_LIMIT_DISABLED = 'false';
    }
  });
});
