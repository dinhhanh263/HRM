import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';
import { authService } from '../../src/domain/services/auth.service.js';

// SPEC-037 — self-service account: every endpoint acts only on req.user.sub.
const TENANT_SLUG = 'account-test-tenant';
const EMP_EMAIL = 'emp@account-test.com';
const EMP_PASSWORD = 'EmpTest@123';
const ADMIN_EMAIL = 'admin@account-test.com';
const ADMIN_PASSWORD = 'AdminTest@123';

async function cleanup(tenantId: string) {
  await db.employee.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
}

describe('Account API (SPEC-037)', () => {
  let tenantId: string;
  let empToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: { settings: {} },
      create: { name: 'Account Test Tenant', slug: TENANT_SLUG, settings: {} },
    });
    tenantId = tenant.id;
    await cleanup(tenantId);

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);

    const dept = await db.department.upsert({
      where: { tenantId_name: { tenantId, name: 'Acc Engineering' } },
      update: {},
      create: { tenantId, name: 'Acc Engineering' },
    });

    // EMPLOYEE có hồ sơ nhân viên đầy đủ.
    const empUser = await db.user.create({
      data: {
        tenantId,
        email: EMP_EMAIL,
        passwordHash: await hashPassword(EMP_PASSWORD),
        fullName: 'Nhân Viên A',
        role: 'EMPLOYEE',
        roleId: roleIdByKey.get('employee'),
        status: 'ACTIVE',
      },
    });
    await db.employee.create({
      data: {
        tenantId,
        userId: empUser.id,
        employeeCode: 'ACC-1',
        fullName: 'Nhân Viên A',
        departmentId: dept.id,
        joinDate: new Date('2025-01-06'),
        contractType: 'FULL_TIME',
        status: 'ACTIVE',
        phone: '0901234567',
      },
    });

    // SUPER_ADMIN thuần — không có employee record.
    await db.user.create({
      data: {
        tenantId,
        email: ADMIN_EMAIL,
        passwordHash: await hashPassword(ADMIN_PASSWORD),
        fullName: 'Pure Admin',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
    });

    const empLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMP_EMAIL, password: EMP_PASSWORD, tenantSlug: TENANT_SLUG });
    empToken = empLogin.body.data.accessToken;
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, tenantSlug: TENANT_SLUG });
    adminToken = adminLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await cleanup(tenantId);
  });

  describe('GET /api/v1/account', () => {
    it('returns the caller’s user info plus their linked employee profile', async () => {
      const res = await request(app)
        .get('/api/v1/account')
        .set('Authorization', `Bearer ${empToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user).toMatchObject({
        fullName: 'Nhân Viên A',
        email: EMP_EMAIL,
        role: 'EMPLOYEE',
      });
      expect(res.body.data.employee).toMatchObject({
        employeeCode: 'ACC-1',
        departmentName: 'Acc Engineering',
        phone: '0901234567',
      });
      expect(res.body.data.googleLinkedAt).toBeNull();
    });

    it('returns employee: null for a user without an employee record', async () => {
      const res = await request(app)
        .get('/api/v1/account')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.fullName).toBe('Pure Admin');
      expect(res.body.data.employee).toBeNull();
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/api/v1/account');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/v1/account/profile', () => {
    it('updates only phone/avatar on the caller’s own employee record', async () => {
      const res = await request(app)
        .patch('/api/v1/account/profile')
        .set('Authorization', `Bearer ${empToken}`)
        .send({ phone: '0987654321', avatar: 'https://cdn.example.com/a.png' });

      expect(res.status).toBe(200);
      expect(res.body.data.employee).toMatchObject({
        phone: '0987654321',
        avatar: 'https://cdn.example.com/a.png',
      });
    });

    it('rejects fields outside the whitelist (strict)', async () => {
      const res = await request(app)
        .patch('/api/v1/account/profile')
        .set('Authorization', `Bearer ${empToken}`)
        .send({ phone: '0911111111', fullName: 'Hacker' });
      expect(res.status).toBe(422);
    });

    it('returns 404 for a user without an employee record', async () => {
      const res = await request(app)
        .patch('/api/v1/account/profile')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ phone: '0900000000' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    const NEW_PASSWORD = 'NewEmp@4567';

    it('rejects a wrong current password with 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${empToken}`)
        .send({ currentPassword: 'WrongPass@1', newPassword: NEW_PASSWORD });
      expect(res.status).toBe(401);
    });

    it('enforces the tenant passwordMinLength', async () => {
      await db.tenant.update({
        where: { id: tenantId },
        data: { settings: { security: { passwordMinLength: 12 } } },
      });

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${empToken}`)
        .send({ currentPassword: EMP_PASSWORD, newPassword: 'Short@123' }); // 9 ký tự
      expect(res.status).toBe(422);

      await db.tenant.update({ where: { id: tenantId }, data: { settings: {} } });
    });

    it('rejects when forceSso is on (non-SUPER_ADMIN)', async () => {
      await db.tenant.update({
        where: { id: tenantId },
        data: { settings: { security: { forceSso: true } } },
      });

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${empToken}`)
        .send({ currentPassword: EMP_PASSWORD, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('SSO_REQUIRED');

      await db.tenant.update({ where: { id: tenantId }, data: { settings: {} } });
    });

    it('changes the password, keeps the current session, revokes the others', async () => {
      // Hai phiên: phiên A (đổi mật khẩu, giữ lại) và phiên B (bị revoke).
      const loginA = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: EMP_EMAIL, password: EMP_PASSWORD, tenantSlug: TENANT_SLUG, rememberMe: true });
      const tokenA = loginA.body.data.accessToken;
      const cookieA = loginA.headers['set-cookie'];
      const loginB = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: EMP_EMAIL, password: EMP_PASSWORD, tenantSlug: TENANT_SLUG, rememberMe: true });
      const cookieB = loginB.headers['set-cookie'];

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Cookie', cookieA)
        .send({ currentPassword: EMP_PASSWORD, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(200);

      // Mật khẩu cũ hết dùng được; mật khẩu mới hoạt động.
      const oldLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: EMP_EMAIL, password: EMP_PASSWORD, tenantSlug: TENANT_SLUG });
      expect(oldLogin.status).toBe(401);
      const newLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: EMP_EMAIL, password: NEW_PASSWORD, tenantSlug: TENANT_SLUG });
      expect(newLogin.status).toBe(200);

      // Phiên B bị revoke; phiên A (hiện tại) vẫn refresh được.
      const refreshB = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookieB);
      expect(refreshB.status).toBe(401);
      const refreshA = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookieA);
      expect(refreshA.status).toBe(200);

      // Khôi phục mật khẩu gốc cho các lần chạy sau.
      await db.user.updateMany({
        where: { tenantId, email: EMP_EMAIL },
        data: { passwordHash: await hashPassword(EMP_PASSWORD) },
      });
    });
  });

  // SPEC-037 P2 — sessions are the user's active refresh tokens.
  describe('sessions', () => {
    const UA_CHROME =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
    const UA_FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0';

    async function loginWithUa(ua: string) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('User-Agent', ua)
        .send({ email: EMP_EMAIL, password: EMP_PASSWORD, tenantSlug: TENANT_SLUG, rememberMe: true });
      return { token: res.body.data.accessToken, cookie: res.headers['set-cookie'] };
    }

    it('lists active sessions with parsed device info and the current flag', async () => {
      const a = await loginWithUa(UA_CHROME);
      await loginWithUa(UA_FIREFOX);

      const res = await request(app)
        .get('/api/v1/account/sessions')
        .set('Authorization', `Bearer ${a.token}`)
        .set('Cookie', a.cookie);

      expect(res.status).toBe(200);
      const sessions = res.body.data;
      expect(sessions.length).toBeGreaterThanOrEqual(2);

      const current = sessions.find((s: { current: boolean }) => s.current);
      expect(current).toBeDefined();
      expect(current.device).toContain('Chrome');
      expect(current.device).toContain('macOS');

      const firefox = sessions.find((s: { device: string | null }) => s.device?.includes('Firefox'));
      expect(firefox).toBeDefined();
      expect(firefox.current).toBe(false);
      // Không bao giờ lộ token/hash.
      expect(JSON.stringify(sessions)).not.toContain('tokenHash');
    });

    it('revoke-others keeps only the current session alive', async () => {
      const a = await loginWithUa(UA_CHROME);
      const b = await loginWithUa(UA_FIREFOX);

      const res = await request(app)
        .post('/api/v1/account/sessions/revoke-others')
        .set('Authorization', `Bearer ${a.token}`)
        .set('Cookie', a.cookie);
      expect(res.status).toBe(200);
      expect(res.body.data.revoked).toBeGreaterThanOrEqual(1);

      const refreshB = await request(app).post('/api/v1/auth/refresh').set('Cookie', b.cookie);
      expect(refreshB.status).toBe(401);
      const refreshA = await request(app).post('/api/v1/auth/refresh').set('Cookie', a.cookie);
      expect(refreshA.status).toBe(200);
    });

    it('refuses revoke-others without a refresh cookie (cannot identify the current session)', async () => {
      const a = await loginWithUa(UA_CHROME);
      const res = await request(app)
        .post('/api/v1/account/sessions/revoke-others')
        .set('Authorization', `Bearer ${a.token}`);
      expect(res.status).toBe(400);
    });
  });

  // SPEC-037 P3 — email notification preferences (per reminder kind).
  describe('PATCH /api/v1/account/notifications', () => {
    it('saves prefs and surfaces them in GET /account', async () => {
      const res = await request(app)
        .patch('/api/v1/account/notifications')
        .set('Authorization', `Bearer ${empToken}`)
        .send({ probation_ending: false });
      expect(res.status).toBe(200);
      expect(res.body.data.notificationPrefs).toEqual({ probation_ending: false });

      // Merge — tắt thêm contract không xoá pref trước đó.
      await request(app)
        .patch('/api/v1/account/notifications')
        .set('Authorization', `Bearer ${empToken}`)
        .send({ contract_expiring: false });
      const after = await request(app)
        .get('/api/v1/account')
        .set('Authorization', `Bearer ${empToken}`);
      expect(after.body.data.notificationPrefs).toEqual({
        probation_ending: false,
        contract_expiring: false,
      });
    });

    it('rejects unknown kinds (strict)', async () => {
      const res = await request(app)
        .patch('/api/v1/account/notifications')
        .set('Authorization', `Bearer ${empToken}`)
        .send({ random_kind: false });
      expect(res.status).toBe(422);
    });
  });

  // SPEC-037 P2 — first successful Google sign-in stamps googleLinkedAt.
  describe('Google linked status', () => {
    it('stamps googleLinkedAt on first Google sign-in and surfaces it in /account', async () => {
      await db.tenantDomain.upsert({
        where: { domain: 'account-test.com' },
        update: { tenantId },
        create: { tenantId, domain: 'account-test.com' },
      });

      await authService.loginWithGoogle({ email: EMP_EMAIL, emailVerified: true });

      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: EMP_EMAIL, password: EMP_PASSWORD, tenantSlug: TENANT_SLUG });
      const res = await request(app)
        .get('/api/v1/account')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`);

      expect(res.body.data.googleLinkedAt).not.toBeNull();
    });
  });
});
