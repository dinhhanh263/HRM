import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword, hashToken } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

const TENANT_SLUG = 'settings-test-tenant';
const HR_EMAIL = 'hr@settings-test.com';
const HR_PASSWORD = 'HrTest@123';
const EMP_EMAIL = 'emp@settings-test.com';
const EMP_PASSWORD = 'EmpTest@123';

async function cleanup(tenantId: string) {
  await db.settingsAuditLog.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
}

describe('Settings API (SPEC-036)', () => {
  let tenantId: string;
  let hrToken: string;
  let empToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: { settings: {} },
      create: { name: 'Settings Test Tenant', slug: TENANT_SLUG, settings: {} },
    });
    tenantId = tenant.id;
    await cleanup(tenantId);

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);

    await db.user.create({
      data: {
        tenantId,
        email: HR_EMAIL,
        passwordHash: await hashPassword(HR_PASSWORD),
        fullName: 'HR Settings',
        role: 'HR_MANAGER',
        roleId: roleIdByKey.get('hr_manager'),
        status: 'ACTIVE',
      },
    });
    await db.user.create({
      data: {
        tenantId,
        email: EMP_EMAIL,
        passwordHash: await hashPassword(EMP_PASSWORD),
        fullName: 'Emp Settings',
        role: 'EMPLOYEE',
        roleId: roleIdByKey.get('employee'),
        status: 'ACTIVE',
      },
    });

    const hrLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: HR_EMAIL, password: HR_PASSWORD, tenantSlug: TENANT_SLUG });
    hrToken = hrLogin.body.data.accessToken;
    const empLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMP_EMAIL, password: EMP_PASSWORD, tenantSlug: TENANT_SLUG });
    empToken = empLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await cleanup(tenantId);
  });

  describe('GET /api/v1/settings', () => {
    it('returns merged defaults for HR (settings:view)', async () => {
      const res = await request(app)
        .get('/api/v1/settings')
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.notifications).toEqual({ probationLeadDays: 7, contractLeadDays: 30 });
      expect(res.body.data.regional).toEqual({ defaultLanguage: 'vi', weekStart: 'mon' });
      expect(res.body.data.security).toEqual({ passwordMinLength: 8, forceSso: false });
      // seats đang dùng = 2 user ACTIVE của tenant này
      expect(res.body.data.plan).toMatchObject({ name: 'Internal', seatLimit: null, seatsUsed: 2 });
    });

    it('is denied for EMPLOYEE (no settings:view) and anonymous', async () => {
      const forbidden = await request(app)
        .get('/api/v1/settings')
        .set('Authorization', `Bearer ${empToken}`);
      expect(forbidden.status).toBe(403);

      const anon = await request(app).get('/api/v1/settings');
      expect(anon.status).toBe(401);
    });
  });

  describe('GET /api/v1/settings/public', () => {
    it('returns the regional section to any authenticated user', async () => {
      const res = await request(app)
        .get('/api/v1/settings/public')
        .set('Authorization', `Bearer ${empToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        regional: { defaultLanguage: 'vi', weekStart: 'mon' },
        security: { forceSso: false },
      });
    });
  });

  describe('PATCH /api/v1/settings/company', () => {
    it('updates company profile for HR and persists it', async () => {
      const res = await request(app)
        .patch('/api/v1/settings/company')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'CodeCrush JSC', taxCode: '0312345678' });

      expect(res.status).toBe(200);
      expect(res.body.data.company).toMatchObject({ name: 'CodeCrush JSC', taxCode: '0312345678' });

      const after = await request(app)
        .get('/api/v1/settings')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(after.body.data.company.name).toBe('CodeCrush JSC');
    });

    it('does not clobber other features’ keys in Tenant.settings', async () => {
      await db.tenant.update({
        where: { id: tenantId },
        data: { settings: { payrollX: { keep: true } } },
      });

      await request(app)
        .patch('/api/v1/settings/company')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Merged Co' });

      const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
      const settings = tenant!.settings as Record<string, unknown>;
      expect(settings.payrollX).toEqual({ keep: true });
      expect((settings.company as Record<string, unknown>).name).toBe('Merged Co');
    });

    it('rejects invalid payloads with 422 and forbids EMPLOYEE', async () => {
      const invalid = await request(app)
        .patch('/api/v1/settings/company')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ contactEmail: 'not-an-email' });
      expect(invalid.status).toBe(422);

      const forbidden = await request(app)
        .patch('/api/v1/settings/company')
        .set('Authorization', `Bearer ${empToken}`)
        .send({ name: 'Nope' });
      expect(forbidden.status).toBe(403);
    });
  });

  // SPEC-036 P3 — every PATCH leaves an audit trail readable by settings:view.
  describe('GET /api/v1/settings/audit', () => {
    it('records who changed which section and returns newest first', async () => {
      await request(app)
        .patch('/api/v1/settings/notifications')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ probationLeadDays: 10 });

      const res = await request(app)
        .get('/api/v1/settings/audit')
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      const entry = res.body.data[0];
      expect(entry).toMatchObject({
        section: 'notifications',
        changedBy: { fullName: 'HR Settings' },
      });
      expect(entry.changes.probationLeadDays).toEqual({ from: 7, to: 10 });

      // Trả lead về mặc định cho các test sau.
      await request(app)
        .patch('/api/v1/settings/notifications')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ probationLeadDays: 7 });
    });

    it('does not write an audit entry when nothing changed', async () => {
      const before = await request(app)
        .get('/api/v1/settings/audit')
        .set('Authorization', `Bearer ${hrToken}`);

      await request(app)
        .patch('/api/v1/settings/regional')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ weekStart: 'mon' }); // giá trị mặc định — không đổi gì

      const after = await request(app)
        .get('/api/v1/settings/audit')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(after.body.data.length).toBe(before.body.data.length);
    });

    it('is denied for EMPLOYEE', async () => {
      const res = await request(app)
        .get('/api/v1/settings/audit')
        .set('Authorization', `Bearer ${empToken}`);
      expect(res.status).toBe(403);
    });
  });

  // SPEC-036 P3 — security policy is ENFORCED server-side, not just stored.
  describe('security policy enforcement', () => {
    afterAll(async () => {
      // Trả về mặc định để các test khác (và lần chạy sau) không bị chặn login.
      await request(app)
        .patch('/api/v1/settings/security')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ forceSso: false, passwordMinLength: 8 });
    });

    it('blocks password login when forceSso is on — except SUPER_ADMIN', async () => {
      await request(app)
        .patch('/api/v1/settings/security')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ forceSso: true });

      const blocked = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: EMP_EMAIL, password: EMP_PASSWORD, tenantSlug: TENANT_SLUG });
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('SSO_REQUIRED');

      // SUPER_ADMIN vẫn vào được — chống tự khoá hệ thống.
      await db.user.create({
        data: {
          tenantId,
          email: 'sa@settings-test.com',
          passwordHash: await hashPassword('SaTest@123'),
          fullName: 'Super Admin',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
        },
      });
      const saLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'sa@settings-test.com', password: 'SaTest@123', tenantSlug: TENANT_SLUG });
      expect(saLogin.status).toBe(200);

      // Tắt lại → login password bình thường.
      await request(app)
        .patch('/api/v1/settings/security')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ forceSso: false });
      const allowed = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: EMP_EMAIL, password: EMP_PASSWORD, tenantSlug: TENANT_SLUG });
      expect(allowed.status).toBe(200);
    });

    it('enforces the tenant passwordMinLength on set-password', async () => {
      await request(app)
        .patch('/api/v1/settings/security')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ passwordMinLength: 12 });

      const rawToken = 'settings-test-invite-token-036';
      const empUser = await db.user.findFirst({ where: { tenantId, email: EMP_EMAIL } });
      await db.user.update({
        where: { id: empUser!.id },
        data: {
          inviteToken: hashToken(rawToken),
          inviteTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      // 9 ký tự — qua Zod min(8) nhưng dưới minLength 12 của tenant → 422.
      const tooShort = await request(app)
        .post('/api/v1/auth/set-password')
        .send({ token: rawToken, password: 'Short@123' });
      expect(tooShort.status).toBe(422);

      const longEnough = await request(app)
        .post('/api/v1/auth/set-password')
        .send({ token: rawToken, password: 'LongEnough@123' });
      expect(longEnough.status).toBe(200);

      // Khôi phục mật khẩu cũ để các test sau còn login được.
      await db.user.update({
        where: { id: empUser!.id },
        data: { passwordHash: await hashPassword(EMP_PASSWORD) },
      });
    });
  });
});
