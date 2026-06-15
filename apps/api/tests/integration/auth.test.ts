import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { authService } from '../../src/domain/services/auth.service.js';
import { emailProvider } from '../../src/infrastructure/email/email.provider.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

const TEST_TENANT_SLUG = 'test-tenant';
const TEST_USER_EMAIL = 'test@example.com';
const TEST_USER_PASSWORD = 'Test@123';

describe('Auth API', () => {
  let testTenantId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TEST_TENANT_SLUG },
      update: {},
      create: {
        name: 'Test Tenant',
        slug: TEST_TENANT_SLUG,
      },
    });
    testTenantId = tenant.id;

    await db.user.deleteMany({
      where: { tenantId: testTenantId },
    });
  });

  afterAll(async () => {
    await db.refreshToken.deleteMany({
      where: { user: { tenantId: testTenantId } },
    });
    await db.user.deleteMany({
      where: { tenantId: testTenantId },
    });
    await db.tenant.delete({
      where: { id: testTenantId },
    });
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user and return tokens', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD,
          fullName: 'Test User',
          tenantSlug: TEST_TENANT_SLUG,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(TEST_USER_EMAIL);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should return 409 if email already exists', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD,
          fullName: 'Test User 2',
          tenantSlug: TEST_TENANT_SLUG,
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('should return 422 for invalid email format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'invalid-email',
          password: TEST_USER_PASSWORD,
          fullName: 'Test User',
          tenantSlug: TEST_TENANT_SLUG,
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should return 422 for weak password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'new@example.com',
          password: 'weak',
          fullName: 'Test User',
          tenantSlug: TEST_TENANT_SLUG,
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 for non-existent tenant', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'new@example.com',
          password: TEST_USER_PASSWORD,
          fullName: 'Test User',
          tenantSlug: 'non-existent-tenant',
        });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD,
          tenantSlug: TEST_TENANT_SLUG,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(TEST_USER_EMAIL);
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('should return 401 for wrong password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: TEST_USER_EMAIL,
          password: 'WrongPassword123',
          tenantSlug: TEST_TENANT_SLUG,
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for non-existent user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: TEST_USER_PASSWORD,
          tenantSlug: TEST_TENANT_SLUG,
        });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/login — remember me', () => {
    /** Pull the `refresh_token` Set-Cookie line out of a response. */
    function refreshCookie(res: request.Response): string {
      const cookies = (res.headers['set-cookie'] ?? []) as unknown as string[];
      return cookies.find((c) => c.startsWith('refresh_token=')) ?? '';
    }

    it('issues a persistent cookie (Max-Age) when rememberMe is true', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        tenantSlug: TEST_TENANT_SLUG,
        rememberMe: true,
      });

      expect(res.status).toBe(200);
      expect(refreshCookie(res)).toMatch(/Max-Age=\d+/i);
    });

    it('issues a session cookie (no Max-Age/Expires) when rememberMe is false', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        tenantSlug: TEST_TENANT_SLUG,
        rememberMe: false,
      });

      expect(res.status).toBe(200);
      const cookie = refreshCookie(res);
      expect(cookie).not.toMatch(/Max-Age/i);
      expect(cookie).not.toMatch(/Expires/i);
    });

    it('defaults to a session cookie when rememberMe is absent', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        tenantSlug: TEST_TENANT_SLUG,
      });

      expect(res.status).toBe(200);
      expect(refreshCookie(res)).not.toMatch(/Max-Age/i);
    });

    it('stores the persistent flag and the matching DB TTL per choice', async () => {
      const user = await db.user.findFirstOrThrow({
        where: { email: TEST_USER_EMAIL, tenantId: testTenantId },
      });

      await request(app).post('/api/v1/auth/login').send({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        tenantSlug: TEST_TENANT_SLUG,
        rememberMe: false,
      });
      const sessionToken = await db.refreshToken.findFirstOrThrow({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(sessionToken.persistent).toBe(false);
      // ~1 day out: comfortably under 2 days, comfortably over 0.
      const sessionDays = (sessionToken.expiresAt.getTime() - Date.now()) / 86_400_000;
      expect(sessionDays).toBeGreaterThan(0.5);
      expect(sessionDays).toBeLessThan(2);

      await request(app).post('/api/v1/auth/login').send({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        tenantSlug: TEST_TENANT_SLUG,
        rememberMe: true,
      });
      const persistentToken = await db.refreshToken.findFirstOrThrow({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(persistentToken.persistent).toBe(true);
      const persistentDays = (persistentToken.expiresAt.getTime() - Date.now()) / 86_400_000;
      expect(persistentDays).toBeGreaterThan(6);
    });

    it('preserves the session cookie type across refresh rotation', async () => {
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        tenantSlug: TEST_TENANT_SLUG,
        rememberMe: false,
      });

      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', loginRes.headers['set-cookie']);

      expect(refreshRes.status).toBe(200);
      expect(refreshCookie(refreshRes)).not.toMatch(/Max-Age/i);
    });

    it('preserves the persistent cookie type across refresh rotation', async () => {
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        tenantSlug: TEST_TENANT_SLUG,
        rememberMe: true,
      });

      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', loginRes.headers['set-cookie']);

      expect(refreshRes.status).toBe(200);
      expect(refreshCookie(refreshRes)).toMatch(/Max-Age=\d+/i);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should refresh access token with valid refresh token', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD,
          tenantSlug: TEST_TENANT_SLUG,
        });

      const cookies = loginRes.headers['set-cookie'];

      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookies);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.success).toBe(true);
      expect(refreshRes.body.data.accessToken).toBeDefined();
    });

    it('should return 401 without refresh token cookie', async () => {
      const res = await request(app).post('/api/v1/auth/refresh');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current user with valid access token', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD,
          tenantSlug: TEST_TENANT_SLUG,
        });

      const { accessToken } = loginRes.body.data;

      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.success).toBe(true);
      expect(meRes.body.data.email).toBe(TEST_USER_EMAIL);
      expect(meRes.body.data).toHaveProperty('roleId');
      expect(Array.isArray(meRes.body.data.permissions)).toBe(true);
    });

    it('should return the resolved permission keys for a user with a role', async () => {
      await seedPermissionCatalog(db);
      const roleIdByKey = await syncSystemRolesForTenant(db, testTenantId);

      const hrUser = await db.user.create({
        data: {
          tenantId: testTenantId,
          email: 'hr-me@example.com',
          passwordHash: await hashPassword('HrMe@1234'),
          fullName: 'HR Me',
          role: 'HR_MANAGER',
          roleId: roleIdByKey.get('hr_manager'),
          status: 'ACTIVE',
        },
      });

      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'hr-me@example.com',
        password: 'HrMe@1234',
        tenantSlug: TEST_TENANT_SLUG,
      });

      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.data.roleId).toBe(hrUser.roleId);
      expect(meRes.body.data.permissions).toContain('employees:create');
      expect(meRes.body.data.permissions).toContain('dashboard:view');
      // HR_MANAGER runs payroll, so it carries payroll processing.
      expect(meRes.body.data.permissions).toContain('payroll:process');
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });

    // SPEC-033: FE cần biết user hiện tại có đang thử việc không (nav "Tự đánh giá").
    describe('employee summary (SPEC-033)', () => {
      it('should return employee {id, contractType} when the user has an employee profile', async () => {
        const probUser = await db.user.create({
          data: {
            tenantId: testTenantId,
            email: 'prob-me@example.com',
            passwordHash: await hashPassword('ProbMe@1234'),
            fullName: 'Probation Me',
            role: 'EMPLOYEE',
            status: 'ACTIVE',
          },
        });
        const employee = await db.employee.create({
          data: {
            tenant: { connect: { id: testTenantId } },
            user: { connect: { id: probUser.id } },
            employeeCode: 'EMP-ME-1',
            fullName: 'Probation Me',
            joinDate: new Date('2026-05-01'),
            contractType: 'PROBATION',
            status: 'ACTIVE',
          },
        });

        const loginRes = await request(app).post('/api/v1/auth/login').send({
          email: 'prob-me@example.com',
          password: 'ProbMe@1234',
          tenantSlug: TEST_TENANT_SLUG,
        });
        const meRes = await request(app)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`);

        expect(meRes.status).toBe(200);
        expect(meRes.body.data.employee).toEqual({
          id: employee.id,
          contractType: 'PROBATION',
        });
      });

      it('should return employee: null when the user has no employee profile', async () => {
        const loginRes = await request(app).post('/api/v1/auth/login').send({
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD,
          tenantSlug: TEST_TENANT_SLUG,
        });
        const meRes = await request(app)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`);

        expect(meRes.status).toBe(200);
        expect(meRes.body.data.employee).toBeNull();
      });
    });
  });

  describe('POST /api/v1/auth/set-password (invite flow)', () => {
    const NEW_PASSWORD = 'Invited@123';

    /** Create an INVITED user (no usable password) and return its id + email. */
    async function createInvitedUser(email: string) {
      const user = await db.user.create({
        data: {
          tenantId: testTenantId,
          email,
          // Unusable random hash — INVITED users cannot log in until set-password.
          passwordHash: await hashPassword('!unusable-' + Math.random().toString(36)),
          fullName: 'Invited User',
          role: 'EMPLOYEE',
          status: 'INVITED',
        },
      });
      return user;
    }

    it('should set the password and activate the account with a valid token', async () => {
      const user = await createInvitedUser('invite-valid@example.com');
      const { token } = await authService.issueInvite(user.id);

      const res = await request(app)
        .post('/api/v1/auth/set-password')
        .send({ token, password: NEW_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.status).toBe('ACTIVE');

      // The activated account can now log in with the chosen password.
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'invite-valid@example.com',
        password: NEW_PASSWORD,
        tenantSlug: TEST_TENANT_SLUG,
      });
      expect(loginRes.status).toBe(200);

      const refreshed = await db.user.findUnique({ where: { id: user.id } });
      expect(refreshed?.passwordSetAt).not.toBeNull();
      expect(refreshed?.inviteToken).toBeNull();
      expect(refreshed?.inviteTokenExpiresAt).toBeNull();
    });

    it('should reject a token that was already used (single-use)', async () => {
      const user = await createInvitedUser('invite-reused@example.com');
      const { token } = await authService.issueInvite(user.id);

      const first = await request(app)
        .post('/api/v1/auth/set-password')
        .send({ token, password: NEW_PASSWORD });
      expect(first.status).toBe(200);

      const second = await request(app)
        .post('/api/v1/auth/set-password')
        .send({ token, password: 'Another@123' });
      expect(second.status).toBe(400);
      expect(second.body.error.code).toBe('BAD_REQUEST');
    });

    it('should reject an expired token', async () => {
      const user = await createInvitedUser('invite-expired@example.com');
      const { token } = await authService.issueInvite(user.id);

      // Force the invite to be in the past.
      await db.user.update({
        where: { id: user.id },
        data: { inviteTokenExpiresAt: new Date(Date.now() - 1000) },
      });

      const res = await request(app)
        .post('/api/v1/auth/set-password')
        .send({ token, password: NEW_PASSWORD });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('should reject an unknown/wrong token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/set-password')
        .send({ token: 'totally-wrong-token', password: NEW_PASSWORD });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('should return 422 for a weak password even with a valid token', async () => {
      const user = await createInvitedUser('invite-weak@example.com');
      const { token } = await authService.issueInvite(user.id);

      const res = await request(app)
        .post('/api/v1/auth/set-password')
        .send({ token, password: 'weak' });
      expect(res.status).toBe(422);
    });
  });

  describe('POST /api/v1/auth/forgot-password', () => {
    const RESET_EMAIL = 'reset-me@example.com';
    const RESET_OLD_PASSWORD = 'OldPass@123';

    /** Create an ACTIVE user with a known password and return it. */
    async function createActiveUser(email: string, password: string) {
      return db.user.create({
        data: {
          tenantId: testTenantId,
          email,
          passwordHash: await hashPassword(password),
          fullName: 'Reset User',
          role: 'EMPLOYEE',
          status: 'ACTIVE',
        },
      });
    }

    it('should respond 200 and mint a reset token for an existing active user', async () => {
      const user = await createActiveUser(RESET_EMAIL, RESET_OLD_PASSWORD);
      const sendSpy = vi.spyOn(emailProvider, 'sendPasswordReset').mockResolvedValue();

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: RESET_EMAIL, tenantSlug: TEST_TENANT_SLUG });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(sendSpy).toHaveBeenCalledOnce();

      const refreshed = await db.user.findUnique({ where: { id: user.id } });
      expect(refreshed?.inviteToken).not.toBeNull();
      expect(refreshed?.inviteTokenExpiresAt).not.toBeNull();

      sendSpy.mockRestore();
    });

    it('should respond 200 without sending for an unknown email (no enumeration)', async () => {
      const sendSpy = vi.spyOn(emailProvider, 'sendPasswordReset').mockResolvedValue();

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'does-not-exist@example.com', tenantSlug: TEST_TENANT_SLUG });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(sendSpy).not.toHaveBeenCalled();

      sendSpy.mockRestore();
    });

    it('should respond 200 without sending for an unknown tenant (no enumeration)', async () => {
      const sendSpy = vi.spyOn(emailProvider, 'sendPasswordReset').mockResolvedValue();

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: RESET_EMAIL, tenantSlug: 'no-such-tenant' });

      expect(res.status).toBe(200);
      expect(sendSpy).not.toHaveBeenCalled();

      sendSpy.mockRestore();
    });

    it('should return 422 for an invalid email format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'not-an-email', tenantSlug: TEST_TENANT_SLUG });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/reset-password', () => {
    const RESET_EMAIL = 'reset-flow@example.com';
    const OLD_PASSWORD = 'OldPass@123';
    const NEW_PASSWORD = 'NewPass@456';

    async function createActiveUser(email: string, password: string) {
      return db.user.create({
        data: {
          tenantId: testTenantId,
          email,
          passwordHash: await hashPassword(password),
          fullName: 'Reset Flow User',
          role: 'EMPLOYEE',
          status: 'ACTIVE',
        },
      });
    }

    /** Mint a reset token by driving the real forgot-password service (email stubbed). */
    async function mintResetToken(email: string): Promise<string> {
      let captured = '';
      const sendSpy = vi
        .spyOn(emailProvider, 'sendPasswordReset')
        .mockImplementation(async ({ link }) => {
          captured = new URL(link).searchParams.get('token') ?? '';
        });
      await authService.requestPasswordReset({ email, tenantSlug: TEST_TENANT_SLUG });
      sendSpy.mockRestore();
      return captured;
    }

    it('should reset the password with a valid token and allow login with the new one', async () => {
      await createActiveUser(RESET_EMAIL, OLD_PASSWORD);
      const token = await mintResetToken(RESET_EMAIL);
      expect(token).not.toBe('');

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: NEW_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Old password no longer works; new one does.
      const oldLogin = await request(app).post('/api/v1/auth/login').send({
        email: RESET_EMAIL,
        password: OLD_PASSWORD,
        tenantSlug: TEST_TENANT_SLUG,
      });
      expect(oldLogin.status).toBe(401);

      const newLogin = await request(app).post('/api/v1/auth/login').send({
        email: RESET_EMAIL,
        password: NEW_PASSWORD,
        tenantSlug: TEST_TENANT_SLUG,
      });
      expect(newLogin.status).toBe(200);
    });

    it('should reject a reset token that was already used (single-use)', async () => {
      await createActiveUser('reset-reused@example.com', OLD_PASSWORD);
      const token = await mintResetToken('reset-reused@example.com');

      const first = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: NEW_PASSWORD });
      expect(first.status).toBe(200);

      const second = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'Another@789' });
      expect(second.status).toBe(400);
      expect(second.body.error.code).toBe('BAD_REQUEST');
    });

    it('should reject an unknown reset token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'totally-wrong-token', password: NEW_PASSWORD });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('should return 422 for a weak password even with a valid token', async () => {
      await createActiveUser('reset-weak@example.com', OLD_PASSWORD);
      const token = await mintResetToken('reset-weak@example.com');

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'weak' });
      expect(res.status).toBe(422);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout and clear refresh token cookie', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD,
          tenantSlug: TEST_TENANT_SLUG,
        });

      const cookies = loginRes.headers['set-cookie'];

      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', cookies);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookies);

      expect(refreshRes.status).toBe(401);
    });
  });
});

describe('Health API', () => {
  it('should return health status', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });
});
