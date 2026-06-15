import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

const TEST_TENANT_SLUG = 'probation-guidelines-test-tenant';
const OTHER_TENANT_SLUG = 'probation-guidelines-other-tenant';
const HR_USER_EMAIL = 'hr@probation-guidelines-test.com';
const HR_USER_PASSWORD = 'HrTest@123';
const MANAGER_USER_EMAIL = 'manager@probation-guidelines-test.com';
const MANAGER_USER_PASSWORD = 'Manager@123';
const EMPLOYEE_USER_EMAIL = 'employee@probation-guidelines-test.com';
const EMPLOYEE_USER_PASSWORD = 'Employee@123';

// SPEC-032 — Hướng dẫn đánh giá theo năm: probation:view đọc, probation:configure ghi,
// mọi truy vấn scope theo tenant.

describe('Probation Guidelines API (SPEC-032)', () => {
  let testTenantId: string;
  let otherTenantId: string;
  let hrToken: string;
  let managerToken: string;
  let employeeToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TEST_TENANT_SLUG },
      update: {},
      create: { name: 'Probation Guidelines Test Tenant', slug: TEST_TENANT_SLUG },
    });
    testTenantId = tenant.id;

    const other = await db.tenant.upsert({
      where: { slug: OTHER_TENANT_SLUG },
      update: {},
      create: { name: 'Probation Guidelines Other Tenant', slug: OTHER_TENANT_SLUG },
    });
    otherTenantId = other.id;

    await db.probationGuideline.deleteMany({
      where: { tenantId: { in: [testTenantId, otherTenantId] } },
    });
    await db.refreshToken.deleteMany({ where: { user: { tenantId: testTenantId } } });
    await db.user.deleteMany({ where: { tenantId: testTenantId } });

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, testTenantId);

    await db.user.create({
      data: {
        tenantId: testTenantId,
        email: HR_USER_EMAIL,
        passwordHash: await hashPassword(HR_USER_PASSWORD),
        fullName: 'HR Manager',
        role: 'HR_MANAGER',
        roleId: roleIdByKey.get('hr_manager'),
        status: 'ACTIVE',
      },
    });
    await db.user.create({
      data: {
        tenantId: testTenantId,
        email: MANAGER_USER_EMAIL,
        passwordHash: await hashPassword(MANAGER_USER_PASSWORD),
        fullName: 'Team Manager',
        role: 'MANAGER',
        roleId: roleIdByKey.get('manager'),
        status: 'ACTIVE',
      },
    });
    await db.user.create({
      data: {
        tenantId: testTenantId,
        email: EMPLOYEE_USER_EMAIL,
        passwordHash: await hashPassword(EMPLOYEE_USER_PASSWORD),
        fullName: 'Plain Employee',
        role: 'EMPLOYEE',
        roleId: roleIdByKey.get('employee'),
        status: 'ACTIVE',
      },
    });

    const loginAs = async (email: string, password: string) => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password, tenantSlug: TEST_TENANT_SLUG });
      return res.body.data.accessToken as string;
    };
    hrToken = await loginAs(HR_USER_EMAIL, HR_USER_PASSWORD);
    managerToken = await loginAs(MANAGER_USER_EMAIL, MANAGER_USER_PASSWORD);
    employeeToken = await loginAs(EMPLOYEE_USER_EMAIL, EMPLOYEE_USER_PASSWORD);
  });

  afterAll(async () => {
    await db.probationGuideline.deleteMany({
      where: { tenantId: { in: [testTenantId, otherTenantId] } },
    });
    await db.refreshToken.deleteMany({ where: { user: { tenantId: testTenantId } } });
    await db.user.deleteMany({ where: { tenantId: testTenantId } });
    await db.tenant.deleteMany({ where: { id: { in: [testTenantId, otherTenantId] } } });
  });

  describe('GET /api/v1/probation/guidelines', () => {
    beforeAll(async () => {
      await db.probationGuideline.createMany({
        data: [
          {
            tenantId: testTenantId,
            year: 2026,
            title: 'Cách chấm rubric',
            content: 'Dòng 1\nDòng 2',
            order: 1,
          },
          {
            tenantId: testTenantId,
            year: 2026,
            title: 'Quy trình duyệt',
            content: 'Manager nộp, HR chốt.',
            order: 0,
          },
          {
            tenantId: testTenantId,
            year: 2025,
            title: 'Hướng dẫn cũ 2025',
            content: 'Nội dung cũ.',
            order: 0,
          },
          {
            tenantId: otherTenantId,
            year: 2026,
            title: 'Bí mật tenant khác',
            content: 'Không được thấy.',
            order: 0,
          },
        ],
      });
    });

    it('should list guidelines for a MANAGER (probation:view), tenant-scoped', async () => {
      const res = await request(app)
        .get('/api/v1/probation/guidelines')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const titles = res.body.data.map((g: { title: string }) => g.title);
      expect(titles).toContain('Cách chấm rubric');
      expect(titles).toContain('Hướng dẫn cũ 2025');
      expect(titles).not.toContain('Bí mật tenant khác');
    });

    it('should filter by ?year= and sort by order then createdAt', async () => {
      const res = await request(app)
        .get('/api/v1/probation/guidelines?year=2026')
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      // order 0 trước order 1
      expect(res.body.data[0].title).toBe('Quy trình duyệt');
      expect(res.body.data[1].title).toBe('Cách chấm rubric');
      expect(res.body.data[1].content).toBe('Dòng 1\nDòng 2');
      expect(res.body.data[1].year).toBe(2026);
    });

    it('should return 403 for an EMPLOYEE (lacks probation:view)', async () => {
      const res = await request(app)
        .get('/api/v1/probation/guidelines')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/v1/probation/guidelines');
      expect(res.status).toBe(401);
    });

    it('should return 422 (not 500) for a non-numeric ?year=', async () => {
      const res = await request(app)
        .get('/api/v1/probation/guidelines?year=abc')
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    // SPEC-032 §2c: nội dung theo ngôn ngữ — lọc ?language=, không truyền = tất cả.
    describe('language filter', () => {
      beforeAll(async () => {
        await db.probationGuideline.create({
          data: {
            tenantId: testTenantId,
            year: 2026,
            language: 'en',
            title: 'English guideline',
            content: 'English content.',
          },
        });
      });

      it('should default existing rows to vi and return them via ?language=vi', async () => {
        const res = await request(app)
          .get('/api/v1/probation/guidelines?language=vi')
          .set('Authorization', `Bearer ${hrToken}`);

        expect(res.status).toBe(200);
        const titles = res.body.data.map((g: { title: string }) => g.title);
        expect(titles).toContain('Cách chấm rubric');
        expect(titles).not.toContain('English guideline');
      });

      it('should return only en rows via ?language=en', async () => {
        const res = await request(app)
          .get('/api/v1/probation/guidelines?language=en')
          .set('Authorization', `Bearer ${hrToken}`);

        expect(res.status).toBe(200);
        const titles = res.body.data.map((g: { title: string }) => g.title);
        expect(titles).toEqual(['English guideline']);
        expect(res.body.data[0].language).toBe('en');
      });

      it('should return all languages when ?language= is omitted (backward compat)', async () => {
        const res = await request(app)
          .get('/api/v1/probation/guidelines')
          .set('Authorization', `Bearer ${hrToken}`);

        const titles = res.body.data.map((g: { title: string }) => g.title);
        expect(titles).toContain('Cách chấm rubric');
        expect(titles).toContain('English guideline');
      });

      it('should return 422 for an unknown ?language=', async () => {
        const res = await request(app)
          .get('/api/v1/probation/guidelines?language=fr')
          .set('Authorization', `Bearer ${hrToken}`);

        expect(res.status).toBe(422);
      });

      it('should create with an explicit language and default to vi when omitted', async () => {
        const withLang = await request(app)
          .post('/api/v1/probation/guidelines')
          .set('Authorization', `Bearer ${hrToken}`)
          .send({ year: 2026, language: 'en', title: 'EN create', content: 'x' });
        expect(withLang.status).toBe(201);
        expect(withLang.body.data.language).toBe('en');

        const withoutLang = await request(app)
          .post('/api/v1/probation/guidelines')
          .set('Authorization', `Bearer ${hrToken}`)
          .send({ year: 2026, title: 'Default lang', content: 'x' });
        expect(withoutLang.status).toBe(201);
        expect(withoutLang.body.data.language).toBe('vi');
      });

      it('should return 422 when creating with an unknown language', async () => {
        const res = await request(app)
          .post('/api/v1/probation/guidelines')
          .set('Authorization', `Bearer ${hrToken}`)
          .send({ year: 2026, language: 'fr', title: 'Sai ngôn ngữ', content: 'x' });

        expect(res.status).toBe(422);
      });
    });
  });

  describe('POST /api/v1/probation/guidelines', () => {
    it('should create a guideline (201) when HR has probation:configure', async () => {
      const res = await request(app)
        .post('/api/v1/probation/guidelines')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          year: 2026,
          title: '  Checklist tuần đầu  ',
          content: 'Bước 1: gặp 1-1.\nBước 2: giao việc nhỏ.',
          order: 2,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('Checklist tuần đầu');
      expect(res.body.data.year).toBe(2026);
      expect(res.body.data.order).toBe(2);
      expect(res.body.data.content).toContain('Bước 2');
      expect(res.body.data.tenantId).toBe(testTenantId);
    });

    it('should return 403 when a MANAGER tries to create (lacks probation:configure)', async () => {
      const res = await request(app)
        .post('/api/v1/probation/guidelines')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ year: 2026, title: 'Lén tạo', content: 'x' });

      expect(res.status).toBe(403);
    });

    it.each([
      [{ year: 2026, title: '', content: 'x' }, 'empty title'],
      [{ year: 2026, title: '   ', content: 'x' }, 'whitespace-only title'],
      [{ year: 1999, title: 'Năm sai', content: 'x' }, 'year below range'],
      [{ year: 2026, title: 'Thiếu content' }, 'missing content'],
      [{ year: 2026, title: 'Quá dài', content: 'a'.repeat(20_001) }, 'content too long'],
    ])('should return 422 for invalid payload (%#: %s)', async (payload) => {
      const res = await request(app)
        .post('/api/v1/probation/guidelines')
        .set('Authorization', `Bearer ${hrToken}`)
        .send(payload);

      expect(res.status).toBe(422);
    });
  });

  describe('PATCH + DELETE /api/v1/probation/guidelines/:id', () => {
    async function createGuideline(overrides: Record<string, unknown> = {}) {
      const created = await db.probationGuideline.create({
        data: {
          tenantId: testTenantId,
          year: 2026,
          title: 'Bài sẽ sửa/xóa',
          content: 'Nội dung gốc.',
          order: 0,
          ...overrides,
        },
      });
      return created.id;
    }

    it('should update title/content/year (200) for HR', async () => {
      const id = await createGuideline();
      const res = await request(app)
        .patch(`/api/v1/probation/guidelines/${id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ title: 'Đã sửa', content: 'Nội dung mới\nDòng 2', year: 2027 });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Đã sửa');
      expect(res.body.data.content).toBe('Nội dung mới\nDòng 2');
      expect(res.body.data.year).toBe(2027);
    });

    it('should return 403 when a MANAGER tries to update', async () => {
      const id = await createGuideline();
      const res = await request(app)
        .patch(`/api/v1/probation/guidelines/${id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ title: 'Lén sửa' });

      expect(res.status).toBe(403);
    });

    it('should return 404 for an unknown id and for a cross-tenant id', async () => {
      const unknown = await request(app)
        .patch('/api/v1/probation/guidelines/nonexistent-id')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ title: 'x' });
      expect(unknown.status).toBe(404);

      const foreign = await db.probationGuideline.create({
        data: { tenantId: otherTenantId, year: 2026, title: 'Của tenant khác', content: 'x' },
      });
      const cross = await request(app)
        .patch(`/api/v1/probation/guidelines/${foreign.id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ title: 'Chiếm đoạt' });
      expect(cross.status).toBe(404);
    });

    it('should return 422 for an invalid update payload', async () => {
      const id = await createGuideline();
      const res = await request(app)
        .patch(`/api/v1/probation/guidelines/${id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ year: 3000 });

      expect(res.status).toBe(422);
    });

    it('should return 422 for an empty PATCH body (would only bump updatedAt)', async () => {
      const id = await createGuideline();
      const res = await request(app)
        .patch(`/api/v1/probation/guidelines/${id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({});

      expect(res.status).toBe(422);
    });

    it('should return 404 when deleting a cross-tenant guideline', async () => {
      const foreign = await db.probationGuideline.create({
        data: { tenantId: otherTenantId, year: 2026, title: 'Xóa chéo tenant', content: 'x' },
      });
      const res = await request(app)
        .delete(`/api/v1/probation/guidelines/${foreign.id}`)
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(404);
      const stillThere = await db.probationGuideline.findUnique({ where: { id: foreign.id } });
      expect(stillThere).not.toBeNull();
    });

    it('should delete (204) for HR and remove the guideline from GET', async () => {
      const id = await createGuideline({ title: 'Bài sẽ bị xóa hẳn' });
      const res = await request(app)
        .delete(`/api/v1/probation/guidelines/${id}`)
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(204);

      const list = await request(app)
        .get('/api/v1/probation/guidelines')
        .set('Authorization', `Bearer ${hrToken}`);
      const ids = list.body.data.map((g: { id: string }) => g.id);
      expect(ids).not.toContain(id);
    });

    it('should return 403 when a MANAGER tries to delete', async () => {
      const id = await createGuideline();
      const res = await request(app)
        .delete(`/api/v1/probation/guidelines/${id}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(403);
    });
  });
});
