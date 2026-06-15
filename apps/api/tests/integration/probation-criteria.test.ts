import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

const TEST_TENANT_SLUG = 'probation-criteria-test-tenant';
const HR_USER_EMAIL = 'hr@probation-criteria-test.com';
const HR_USER_PASSWORD = 'HrTest@123';
const MANAGER_USER_EMAIL = 'manager@probation-criteria-test.com';
const MANAGER_USER_PASSWORD = 'Manager@123';

describe('Probation Criteria API (SPEC-030)', () => {
  let testTenantId: string;
  let hrToken: string;
  let managerToken: string;
  let subjectEmployeeId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TEST_TENANT_SLUG },
      update: {},
      create: { name: 'Probation Criteria Test Tenant', slug: TEST_TENANT_SLUG },
    });
    testTenantId = tenant.id;

    await db.probationReview.deleteMany({ where: { tenantId: testTenantId } });
    await db.probationCriteria.deleteMany({ where: { tenantId: testTenantId } });
    await db.employee.deleteMany({ where: { tenantId: testTenantId } });
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

    const managerUser = await db.user.create({
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

    await db.employee.create({
      data: {
        tenant: { connect: { id: testTenantId } },
        user: { connect: { id: managerUser.id } },
        employeeCode: 'EMP-100',
        fullName: 'Team Manager',
        joinDate: new Date('2026-01-01'),
        contractType: 'FULL_TIME',
        status: 'ACTIVE',
      },
    });

    const subjectUser = await db.user.create({
      data: {
        tenantId: testTenantId,
        email: 'subject@probation-criteria-test.com',
        passwordHash: await hashPassword('Subject@123'),
        fullName: 'Probation Subject',
        role: 'EMPLOYEE',
        roleId: roleIdByKey.get('employee'),
        status: 'ACTIVE',
      },
    });

    const subjectEmployee = await db.employee.create({
      data: {
        tenant: { connect: { id: testTenantId } },
        user: { connect: { id: subjectUser.id } },
        employeeCode: 'EMP-001',
        fullName: 'Probation Subject',
        joinDate: new Date('2026-01-01'),
        contractType: 'PROBATION',
        status: 'ACTIVE',
      },
    });
    subjectEmployeeId = subjectEmployee.id;

    const hrLogin = await request(app).post('/api/v1/auth/login').send({
      email: HR_USER_EMAIL,
      password: HR_USER_PASSWORD,
      tenantSlug: TEST_TENANT_SLUG,
    });
    hrToken = hrLogin.body.data.accessToken;

    const managerLogin = await request(app).post('/api/v1/auth/login').send({
      email: MANAGER_USER_EMAIL,
      password: MANAGER_USER_PASSWORD,
      tenantSlug: TEST_TENANT_SLUG,
    });
    managerToken = managerLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await db.probationReview.deleteMany({ where: { tenantId: testTenantId } });
    await db.probationCriteria.deleteMany({ where: { tenantId: testTenantId } });
    await db.employee.deleteMany({ where: { tenantId: testTenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId: testTenantId } } });
    await db.user.deleteMany({ where: { tenantId: testTenantId } });
    await db.tenant.delete({ where: { id: testTenantId } });
  });

  describe('POST /api/v1/probation/criteria', () => {
    it('should create a criteria (201) when HR has probation:configure', async () => {
      const res = await request(app)
        .post('/api/v1/probation/criteria')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: '  Chất lượng công việc  ', order: 1 });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Chất lượng công việc');
      expect(res.body.data.order).toBe(1);
      expect(res.body.data.isActive).toBe(true);
    });

    it('should return 403 when MANAGER lacks probation:configure', async () => {
      const res = await request(app)
        .post('/api/v1/probation/criteria')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ name: 'Thái độ' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post('/api/v1/probation/criteria')
        .send({ name: 'Thái độ' });

      expect(res.status).toBe(401);
    });

    it('should return 422 when name is empty', async () => {
      const res = await request(app)
        .post('/api/v1/probation/criteria')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: '' });

      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/v1/probation/criteria', () => {
    it('should list criteria for HR (probation:view)', async () => {
      const res = await request(app)
        .get('/api/v1/probation/criteria')
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should let a MANAGER list criteria (probation:view) for scoring', async () => {
      const res = await request(app)
        .get('/api/v1/probation/criteria')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should filter to active only when activeOnly=true', async () => {
      const inactive = await db.probationCriteria.create({
        data: { tenantId: testTenantId, name: 'Tiêu chí ẩn', order: 9, isActive: false },
      });

      const res = await request(app)
        .get('/api/v1/probation/criteria?activeOnly=true')
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((c: { id: string }) => c.id);
      expect(ids).not.toContain(inactive.id);

      await db.probationCriteria.delete({ where: { id: inactive.id } });
    });
  });

  describe('PATCH /api/v1/probation/criteria/:id', () => {
    it('should update a criteria (HR)', async () => {
      const criteria = await db.probationCriteria.create({
        data: { tenantId: testTenantId, name: 'Cũ', order: 2 },
      });

      const res = await request(app)
        .patch(`/api/v1/probation/criteria/${criteria.id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Mới', isActive: false });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Mới');
      expect(res.body.data.isActive).toBe(false);
    });

    it('should return 404 for an unknown criteria', async () => {
      const res = await request(app)
        .patch('/api/v1/probation/criteria/nonexistent-id')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'x' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/probation/criteria/:id', () => {
    it('should delete an unused criteria (204)', async () => {
      const criteria = await db.probationCriteria.create({
        data: { tenantId: testTenantId, name: 'Xóa được', order: 3 },
      });

      const res = await request(app)
        .delete(`/api/v1/probation/criteria/${criteria.id}`)
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(204);
      const found = await db.probationCriteria.findUnique({ where: { id: criteria.id } });
      expect(found).toBeNull();
    });

    it('should block deleting a criteria used in a review (409 PROBATION_CRITERIA_IN_USE)', async () => {
      const criteria = await db.probationCriteria.create({
        data: { tenantId: testTenantId, name: 'Đã dùng', order: 4 },
      });

      // A review whose ratings JSON references this criteria id as a key.
      await db.probationReview.create({
        data: {
          tenantId: testTenantId,
          employeeId: subjectEmployeeId,
          status: 'DECIDED',
          ratings: { [criteria.id]: 4 },
        },
      });

      const res = await request(app)
        .delete(`/api/v1/probation/criteria/${criteria.id}`)
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('PROBATION_CRITERIA_IN_USE');

      const stillThere = await db.probationCriteria.findUnique({ where: { id: criteria.id } });
      expect(stillThere).not.toBeNull();
    });

    it('should return 403 when MANAGER lacks probation:configure', async () => {
      const criteria = await db.probationCriteria.create({
        data: { tenantId: testTenantId, name: 'Bảo vệ', order: 5 },
      });

      const res = await request(app)
        .delete(`/api/v1/probation/criteria/${criteria.id}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(403);
    });
  });

  // SPEC-031: tiêu chí mang nhóm What/How (`group`) + rubric BARS 5 mức tùy chọn.
  describe('criteria group + rubric (SPEC-031)', () => {
    const validRubric = [1, 2, 3, 4, 5].map((score) => ({
      score,
      level: `Mức ${score}`,
      definition: `Định nghĩa mức ${score}`,
      observable: `Biểu hiện mức ${score}`,
    }));

    it('should create a VALUES criteria with a 5-level rubric', async () => {
      const res = await request(app)
        .post('/api/v1/probation/criteria')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Phù hợp văn hóa', order: 6, group: 'VALUES', rubric: validRubric });

      expect(res.status).toBe(201);
      expect(res.body.data.group).toBe('VALUES');
      expect(res.body.data.rubric).toHaveLength(5);
      expect(res.body.data.rubric[0]).toMatchObject({ score: 1, level: 'Mức 1' });
    });

    it('should default group to PERFORMANCE and rubric to null when omitted', async () => {
      const res = await request(app)
        .post('/api/v1/probation/criteria')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Không rubric', order: 7 });

      expect(res.status).toBe(201);
      expect(res.body.data.group).toBe('PERFORMANCE');
      expect(res.body.data.rubric).toBeNull();
    });

    it('should return 422 when rubric does not have exactly 5 levels', async () => {
      const res = await request(app)
        .post('/api/v1/probation/criteria')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Rubric thiếu', rubric: validRubric.slice(0, 4) });

      expect(res.status).toBe(422);
    });

    it('should return 422 when rubric scores are duplicated', async () => {
      const dupRubric = validRubric.map((l) => ({ ...l, score: 3 }));
      const res = await request(app)
        .post('/api/v1/probation/criteria')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Rubric trùng điểm', rubric: dupRubric });

      expect(res.status).toBe(422);
    });

    it('should return 422 for an unknown group', async () => {
      const res = await request(app)
        .post('/api/v1/probation/criteria')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Group lạ', group: 'SOMETHING_ELSE' });

      expect(res.status).toBe(422);
    });

    it('should update group and clear rubric with null via PATCH', async () => {
      const created = await request(app)
        .post('/api/v1/probation/criteria')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Sẽ đổi nhóm', order: 8, rubric: validRubric });
      expect(created.status).toBe(201);

      const res = await request(app)
        .patch(`/api/v1/probation/criteria/${created.body.data.id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ group: 'VALUES', rubric: null });

      expect(res.status).toBe(200);
      expect(res.body.data.group).toBe('VALUES');
      expect(res.body.data.rubric).toBeNull();
    });

    it('should keep existing rubric untouched when PATCH omits it', async () => {
      const created = await request(app)
        .post('/api/v1/probation/criteria')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Giữ rubric', order: 9, rubric: validRubric });

      const res = await request(app)
        .patch(`/api/v1/probation/criteria/${created.body.data.id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Giữ rubric (đổi tên)' });

      expect(res.status).toBe(200);
      expect(res.body.data.rubric).toHaveLength(5);
    });

    it('should return group + rubric in the list endpoint', async () => {
      const res = await request(app)
        .get('/api/v1/probation/criteria')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      const withRubric = res.body.data.find(
        (c: { name: string }) => c.name === 'Phù hợp văn hóa',
      );
      expect(withRubric.group).toBe('VALUES');
      expect(withRubric.rubric).toHaveLength(5);
    });
  });
});
