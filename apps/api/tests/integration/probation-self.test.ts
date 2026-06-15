import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

const TEST_TENANT_SLUG = 'probation-self-test-tenant';
const HR_USER_EMAIL = 'hr@probation-self-test.com';
const MANAGER_USER_EMAIL = 'manager@probation-self-test.com';
const SUBJECT_USER_EMAIL = 'subject@probation-self-test.com';
const OTHER_USER_EMAIL = 'other@probation-self-test.com';
const FULLTIME_USER_EMAIL = 'fulltime@probation-self-test.com';
const PASSWORD = 'Test@1234';

// SPEC-033 — Self Evaluation (Step 1). NV thử việc tự chấm trên review của CHÍNH MÌNH;
// privacy DTO không lộ dữ liệu manager; bất biến sau nộp; chặn mềm với manager.

describe('Probation Self Evaluation API (SPEC-033)', () => {
  let testTenantId: string;
  let hrToken: string;
  let managerToken: string;
  let subjectToken: string;
  let otherToken: string;
  let fulltimeToken: string;
  let managerEmployeeId: string;
  let subjectEmployeeId: string;
  let otherEmployeeId: string;
  let criteriaA: string;
  let criteriaB: string;

  async function makeUserWithEmployee(opts: {
    email: string;
    role: 'HR_MANAGER' | 'MANAGER' | 'EMPLOYEE';
    roleId: string | undefined;
    code: string;
    contractType: 'PROBATION' | 'FULL_TIME';
    managerId?: string;
  }) {
    const user = await db.user.create({
      data: {
        tenantId: testTenantId,
        email: opts.email,
        passwordHash: await hashPassword(PASSWORD),
        fullName: opts.email.split('@')[0],
        role: opts.role,
        roleId: opts.roleId,
        status: 'ACTIVE',
      },
    });
    const employee = await db.employee.create({
      data: {
        tenant: { connect: { id: testTenantId } },
        user: { connect: { id: user.id } },
        employeeCode: opts.code,
        fullName: opts.email.split('@')[0],
        joinDate: new Date('2026-03-01'),
        probationEndDate: opts.contractType === 'PROBATION' ? new Date('2026-09-01') : null,
        contractType: opts.contractType,
        status: 'ACTIVE',
        ...(opts.managerId ? { manager: { connect: { id: opts.managerId } } } : {}),
      },
    });
    return { user, employee };
  }

  async function login(email: string): Promise<string> {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD, tenantSlug: TEST_TENANT_SLUG });
    return res.body.data.accessToken;
  }

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TEST_TENANT_SLUG },
      update: {},
      create: { name: 'Probation Self Test Tenant', slug: TEST_TENANT_SLUG },
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
        passwordHash: await hashPassword(PASSWORD),
        fullName: 'HR',
        role: 'HR_MANAGER',
        roleId: roleIdByKey.get('hr_manager'),
        status: 'ACTIVE',
      },
    });

    const manager = await makeUserWithEmployee({
      email: MANAGER_USER_EMAIL,
      role: 'MANAGER',
      roleId: roleIdByKey.get('manager'),
      code: 'EMP-M1',
      contractType: 'FULL_TIME',
    });
    managerEmployeeId = manager.employee.id;

    const subject = await makeUserWithEmployee({
      email: SUBJECT_USER_EMAIL,
      role: 'EMPLOYEE',
      roleId: roleIdByKey.get('employee'),
      code: 'EMP-S1',
      contractType: 'PROBATION',
      managerId: managerEmployeeId,
    });
    subjectEmployeeId = subject.employee.id;

    const other = await makeUserWithEmployee({
      email: OTHER_USER_EMAIL,
      role: 'EMPLOYEE',
      roleId: roleIdByKey.get('employee'),
      code: 'EMP-S2',
      contractType: 'PROBATION',
      managerId: managerEmployeeId,
    });
    otherEmployeeId = other.employee.id;

    await makeUserWithEmployee({
      email: FULLTIME_USER_EMAIL,
      role: 'EMPLOYEE',
      roleId: roleIdByKey.get('employee'),
      code: 'EMP-F1',
      contractType: 'FULL_TIME',
    });

    const a = await db.probationCriteria.create({
      data: { tenantId: testTenantId, name: 'Quality', order: 0, isActive: true },
    });
    const b = await db.probationCriteria.create({
      data: { tenantId: testTenantId, name: 'Ownership', order: 1, isActive: true },
    });
    criteriaA = a.id;
    criteriaB = b.id;

    hrToken = await login(HR_USER_EMAIL);
    managerToken = await login(MANAGER_USER_EMAIL);
    subjectToken = await login(SUBJECT_USER_EMAIL);
    otherToken = await login(OTHER_USER_EMAIL);
    fulltimeToken = await login(FULLTIME_USER_EMAIL);
  });

  afterAll(async () => {
    await db.notification.deleteMany({ where: { tenantId: testTenantId } });
    await db.probationReview.deleteMany({ where: { tenantId: testTenantId } });
    await db.probationCriteria.deleteMany({ where: { tenantId: testTenantId } });
    await db.employee.deleteMany({ where: { tenantId: testTenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId: testTenantId } } });
    await db.user.deleteMany({ where: { tenantId: testTenantId } });
    await db.tenant.delete({ where: { id: testTenantId } });
  });

  let reviewId: string;

  // Mỗi test bắt đầu với một review DRAFT sạch cho subject.
  beforeEach(async () => {
    await db.probationReview.deleteMany({ where: { tenantId: testTenantId } });
    const review = await db.probationReview.create({
      data: {
        tenantId: testTenantId,
        employeeId: subjectEmployeeId,
        reviewerId: managerEmployeeId,
        status: 'DRAFT',
      },
    });
    reviewId = review.id;
  });

  describe('notification on review creation (SPEC-033 Slice 3)', () => {
    it('should notify the subject employee’s user with kind probation_self_requested', async () => {
      await db.probationReview.deleteMany({ where: { tenantId: testTenantId } });
      await db.notification.deleteMany({ where: { tenantId: testTenantId } });

      const res = await request(app)
        .post('/api/v1/probation/reviews')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ employeeId: subjectEmployeeId });
      expect(res.status).toBe(201);

      const subjectUser = await db.user.findFirst({
        where: { tenantId: testTenantId, email: SUBJECT_USER_EMAIL },
      });
      const notifications = await db.notification.findMany({
        where: { tenantId: testTenantId, kind: 'probation_self_requested' },
      });
      expect(notifications).toHaveLength(1);
      expect(notifications[0].userId).toBe(subjectUser!.id);
      expect(notifications[0].entityType).toBe('probation_review');
      expect(notifications[0].entityId).toBe(res.body.data.id);
    });
  });

  describe('GET /api/v1/probation/reviews/me', () => {
    it('should return the subject employee’s open review with criteria, without manager fields', async () => {
      const res = await request(app)
        .get('/api/v1/probation/reviews/me')
        .set('Authorization', `Bearer ${subjectToken}`);

      expect(res.status).toBe(200);
      const dto = res.body.data;
      expect(dto.id).toBe(reviewId);
      expect(dto.status).toBe('DRAFT');
      expect(dto.criteria.map((c: { id: string }) => c.id).sort()).toEqual(
        [criteriaA, criteriaB].sort()
      );
      expect(dto.selfRatings).toBeNull();
      expect(dto.selfSubmittedAt).toBeNull();
      // privacy: tuyệt đối không lộ dữ liệu của manager/HR
      expect(dto.ratings).toBeUndefined();
      expect(dto.recommendation).toBeUndefined();
      expect(dto.deliverables).toBeUndefined();
      expect(dto.strengths).toBeUndefined();
      expect(dto.decision).toBeUndefined();
    });

    it('should return 404 for a FULL_TIME employee (not on probation)', async () => {
      const res = await request(app)
        .get('/api/v1/probation/reviews/me')
        .set('Authorization', `Bearer ${fulltimeToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 404 when on probation but no open review exists', async () => {
      await db.probationReview.deleteMany({ where: { tenantId: testTenantId } });
      const res = await request(app)
        .get('/api/v1/probation/reviews/me')
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(404);
    });

    it('should still return a PENDING_HR review (read-only view for the subject)', async () => {
      await db.probationReview.update({
        where: { id: reviewId },
        data: { status: 'PENDING_HR' },
      });
      const res = await request(app)
        .get('/api/v1/probation/reviews/me')
        .set('Authorization', `Bearer ${subjectToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PENDING_HR');
    });

    it('should return 404 once the review is DECIDED (no longer open)', async () => {
      await db.probationReview.update({
        where: { id: reviewId },
        data: { status: 'DECIDED' },
      });
      const res = await request(app)
        .get('/api/v1/probation/reviews/me')
        .set('Authorization', `Bearer ${subjectToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/v1/probation/reviews/me');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/v1/probation/reviews/:id/self', () => {
    it('should let the subject save a partial self draft (200)', async () => {
      const res = await request(app)
        .patch(`/api/v1/probation/reviews/${reviewId}/self`)
        .set('Authorization', `Bearer ${subjectToken}`)
        .send({ selfRatings: { [criteriaA]: 4 }, selfComment: 'Tháng đầu ổn' });

      expect(res.status).toBe(200);
      expect(res.body.data.selfRatings).toEqual({ [criteriaA]: 4 });
      expect(res.body.data.selfComment).toBe('Tháng đầu ổn');
      expect(res.body.data.selfSubmittedAt).toBeNull();
    });

    it('should return 403 when another employee touches someone else’s review', async () => {
      const res = await request(app)
        .patch(`/api/v1/probation/reviews/${reviewId}/self`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ selfRatings: { [criteriaA]: 5 } });

      expect(res.status).toBe(403);
    });

    it('should return 422 when selfComment exceeds 2000 characters', async () => {
      const res = await request(app)
        .patch(`/api/v1/probation/reviews/${reviewId}/self`)
        .set('Authorization', `Bearer ${subjectToken}`)
        .send({ selfComment: 'a'.repeat(2001) });

      expect(res.status).toBe(422);
    });

    it('should return 422 for an out-of-range self rating', async () => {
      const res = await request(app)
        .patch(`/api/v1/probation/reviews/${reviewId}/self`)
        .set('Authorization', `Bearer ${subjectToken}`)
        .send({ selfRatings: { [criteriaA]: 6 } });

      expect(res.status).toBe(422);
    });

    it('should return 409 once the review left DRAFT (manager already submitted)', async () => {
      await db.probationReview.update({
        where: { id: reviewId },
        data: { status: 'PENDING_HR' },
      });
      const res = await request(app)
        .patch(`/api/v1/probation/reviews/${reviewId}/self`)
        .set('Authorization', `Bearer ${subjectToken}`)
        .send({ selfRatings: { [criteriaA]: 3 } });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PROBATION_SELF_NOT_EDITABLE');
    });
  });

  describe('POST /api/v1/probation/reviews/:id/self/submit', () => {
    it('should block submit when not all active criteria are self-scored (400)', async () => {
      const res = await request(app)
        .post(`/api/v1/probation/reviews/${reviewId}/self/submit`)
        .set('Authorization', `Bearer ${subjectToken}`)
        .send({ selfRatings: { [criteriaA]: 4 }, selfComment: null });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PROBATION_SELF_INCOMPLETE');
    });

    it('should strip unknown criteria keys when submitting', async () => {
      const res = await request(app)
        .post(`/api/v1/probation/reviews/${reviewId}/self/submit`)
        .set('Authorization', `Bearer ${subjectToken}`)
        .send({
          selfRatings: { [criteriaA]: 4, [criteriaB]: 5, 'unknown-criteria-id': 1 },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.selfRatings).toEqual({ [criteriaA]: 4, [criteriaB]: 5 });
    });

    it('should submit a complete self evaluation, then lock it (409 on re-edit)', async () => {
      const res = await request(app)
        .post(`/api/v1/probation/reviews/${reviewId}/self/submit`)
        .set('Authorization', `Bearer ${subjectToken}`)
        .send({
          selfRatings: { [criteriaA]: 4, [criteriaB]: 5 },
          selfComment: 'Tự tin với vai trò',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.selfSubmittedAt).toBeTruthy();

      const reEdit = await request(app)
        .patch(`/api/v1/probation/reviews/${reviewId}/self`)
        .set('Authorization', `Bearer ${subjectToken}`)
        .send({ selfRatings: { [criteriaA]: 1 } });
      expect(reEdit.status).toBe(409);
      expect(reEdit.body.error.code).toBe('PROBATION_SELF_NOT_EDITABLE');
    });

    it('soft-block: manager can still submit their scorecard when self is missing, and the manager DTO shows self as not submitted', async () => {
      const submit = await request(app)
        .post(`/api/v1/probation/reviews/${reviewId}/submit`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          ratings: { [criteriaA]: 4, [criteriaB]: 4 },
          recommendation: 'CONFIRM',
        });

      expect(submit.status).toBe(200);
      expect(submit.body.data.status).toBe('PENDING_HR');
      expect(submit.body.data.selfSubmittedAt).toBeNull();
      expect(submit.body.data.selfRatings).toBeNull();
    });

    it('manager/HR DTO returns self data only AFTER the subject submitted (draft self stays private)', async () => {
      // NV lưu nháp (chưa nộp) → manager không thấy
      await request(app)
        .patch(`/api/v1/probation/reviews/${reviewId}/self`)
        .set('Authorization', `Bearer ${subjectToken}`)
        .send({ selfRatings: { [criteriaA]: 2 } });

      const asDraft = await request(app)
        .get(`/api/v1/probation/reviews/${reviewId}`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(asDraft.body.data.selfRatings).toBeNull();
      expect(asDraft.body.data.selfSubmittedAt).toBeNull();

      // NV nộp → manager + HR thấy
      await request(app)
        .post(`/api/v1/probation/reviews/${reviewId}/self/submit`)
        .set('Authorization', `Bearer ${subjectToken}`)
        .send({ selfRatings: { [criteriaA]: 2, [criteriaB]: 5 }, selfComment: 'ok' });

      const asSubmitted = await request(app)
        .get(`/api/v1/probation/reviews/${reviewId}`)
        .set('Authorization', `Bearer ${hrToken}`);
      expect(asSubmitted.body.data.selfRatings).toEqual({
        [criteriaA]: 2,
        [criteriaB]: 5,
      });
      expect(asSubmitted.body.data.selfComment).toBe('ok');
      expect(asSubmitted.body.data.selfSubmittedAt).toBeTruthy();
    });
  });
});
