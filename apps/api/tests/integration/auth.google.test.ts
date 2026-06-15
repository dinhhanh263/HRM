import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Pretend SSO is configured so the routes don't short-circuit, and stub the
// real Google calls (getAuthUrl / verifyCode) — we never reach Google in tests.
vi.mock('../../src/shared/configs/google.config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/shared/configs/google.config.js')>();
  return { ...actual, isGoogleSsoConfigured: () => true };
});

const verifyCode = vi.fn();
vi.mock('../../src/domain/services/google.service.js', () => ({
  googleService: {
    getAuthUrl: (state: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
    verifyCode: (code: string) => verifyCode(code),
  },
}));

import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { UserStatus } from '@prisma/client';

const TENANT_SLUG = 'sso-test-tenant';
const DOMAIN = 'ssotest.example';
const ACTIVE_EMAIL = `active@${DOMAIN}`;
const INACTIVE_EMAIL = `pending@${DOMAIN}`;

/** Pull the value of a named cookie out of a Set-Cookie header array. */
function cookieValue(setCookie: string[] | undefined, name: string): string | undefined {
  const line = (setCookie ?? []).find((c) => c.startsWith(`${name}=`));
  return line?.split(';')[0]?.split('=')[1];
}

describe('Google SSO API', () => {
  let tenantId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'SSO Test Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;

    await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.tenantDomain.deleteMany({ where: { tenantId } });

    await db.tenantDomain.create({ data: { tenantId, domain: DOMAIN } });

    await db.user.create({
      data: {
        tenantId,
        email: ACTIVE_EMAIL,
        passwordHash: 'x',
        fullName: 'Active User',
        status: UserStatus.ACTIVE,
      },
    });
    await db.user.create({
      data: {
        tenantId,
        email: INACTIVE_EMAIL,
        passwordHash: 'x',
        fullName: 'Pending User',
        status: UserStatus.PENDING,
      },
    });
  });

  afterAll(async () => {
    await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.tenantDomain.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
  });

  beforeEach(() => {
    verifyCode.mockReset();
  });

  describe('GET /api/v1/auth/google', () => {
    it('sets a state cookie and redirects to Google consent', async () => {
      const res = await request(app).get('/api/v1/auth/google');

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('accounts.google.com');
      const state = cookieValue(res.headers['set-cookie'] as unknown as string[], 'g_oauth_state');
      expect(state).toBeTruthy();
      // The consent URL must carry the same state we stashed in the cookie.
      expect(res.headers.location).toContain(`state=${state}`);
    });
  });

  describe('GET /api/v1/auth/google/callback', () => {
    /** Run start to obtain a valid (cookie, state) pair like a real browser. */
    async function startFlow() {
      const start = await request(app).get('/api/v1/auth/google');
      const setCookie = start.headers['set-cookie'] as unknown as string[];
      const state = cookieValue(setCookie, 'g_oauth_state')!;
      return { stateCookie: `g_oauth_state=${state}`, state };
    }

    it('signs in an ACTIVE user and sets a refresh cookie', async () => {
      verifyCode.mockResolvedValue({ email: ACTIVE_EMAIL, emailVerified: true, name: 'Active' });
      const { stateCookie, state } = await startFlow();

      const res = await request(app)
        .get(`/api/v1/auth/google/callback?code=good-code&state=${state}`)
        .set('Cookie', stateCookie);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/auth/google/success');
      const refresh = cookieValue(res.headers['set-cookie'] as unknown as string[], 'refresh_token');
      expect(refresh).toBeTruthy();
      expect(verifyCode).toHaveBeenCalledWith('good-code');
    });

    it('rejects when state does not match the cookie (CSRF)', async () => {
      verifyCode.mockResolvedValue({ email: ACTIVE_EMAIL, emailVerified: true, name: 'Active' });
      const { stateCookie } = await startFlow();

      const res = await request(app)
        .get('/api/v1/auth/google/callback?code=good-code&state=forged-state')
        .set('Cookie', stateCookie);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login?error=sso');
      expect(verifyCode).not.toHaveBeenCalled();
    });

    it('rejects when the Google email is not verified', async () => {
      verifyCode.mockResolvedValue({ email: ACTIVE_EMAIL, emailVerified: false, name: 'Active' });
      const { stateCookie, state } = await startFlow();

      const res = await request(app)
        .get(`/api/v1/auth/google/callback?code=good-code&state=${state}`)
        .set('Cookie', stateCookie);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login?error=sso');
    });

    it('rejects an unknown email domain', async () => {
      verifyCode.mockResolvedValue({
        email: 'someone@unknown-domain.com',
        emailVerified: true,
        name: 'X',
      });
      const { stateCookie, state } = await startFlow();

      const res = await request(app)
        .get(`/api/v1/auth/google/callback?code=good-code&state=${state}`)
        .set('Cookie', stateCookie);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login?error=sso');
    });

    it('rejects an email with no matching user (invite-only)', async () => {
      verifyCode.mockResolvedValue({ email: `ghost@${DOMAIN}`, emailVerified: true, name: 'Ghost' });
      const { stateCookie, state } = await startFlow();

      const res = await request(app)
        .get(`/api/v1/auth/google/callback?code=good-code&state=${state}`)
        .set('Cookie', stateCookie);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login?error=sso');
    });

    it('rejects a non-ACTIVE user', async () => {
      verifyCode.mockResolvedValue({ email: INACTIVE_EMAIL, emailVerified: true, name: 'Pending' });
      const { stateCookie, state } = await startFlow();

      const res = await request(app)
        .get(`/api/v1/auth/google/callback?code=good-code&state=${state}`)
        .set('Cookie', stateCookie);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login?error=sso');
    });
  });
});
