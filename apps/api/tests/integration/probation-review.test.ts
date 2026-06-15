import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

const TEST_TENANT_SLUG = 'probation-review-test-tenant';
const HR_USER_EMAIL = 'hr@probation-review-test.com';
const HR_USER_PASSWORD = 'HrTest@123';
const MANAGER_USER_EMAIL = 'manager@probation-review-test.com';
const MANAGER_USER_PASSWORD = 'Manager@123';
const SUBJECT_USER_EMAIL = 'subject@probation-review-test.com';
const SUBJECT_USER_PASSWORD = 'Subject@123';

describe('Probation Review API (SPEC-030)', () => {
  let testTenantId: string;
  let hrToken: string;
  let managerToken: string;
  let employeeToken: string;
  let managerEmployeeId: string;
  // Reports to the manager, on probation — the in-scope subject.
  let reportEmployeeId: string;
  // Does NOT report to the manager — out of the manager's scope.
  let outsiderEmployeeId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TEST_TENANT_SLUG },
      update: {},
      create: { name: 'Probation Review Test Tenant', slug: TEST_TENANT_SLUG },
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

    const managerEmployee = await db.employee.create({
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
    managerEmployeeId = managerEmployee.id;

    const subjectUser = await db.user.create({
      data: {
        tenantId: testTenantId,
        email: SUBJECT_USER_EMAIL,
        passwordHash: await hashPassword(SUBJECT_USER_PASSWORD),
        fullName: 'Probation Subject',
        role: 'EMPLOYEE',
        roleId: roleIdByKey.get('employee'),
        status: 'ACTIVE',
      },
    });

    const reportEmployee = await db.employee.create({
      data: {
        tenant: { connect: { id: testTenantId } },
        user: { connect: { id: subjectUser.id } },
        employeeCode: 'EMP-001',
        fullName: 'Probation Subject',
        joinDate: new Date('2026-01-01'),
        probationEndDate: new Date('2026-04-01'),
        contractType: 'PROBATION',
        status: 'ACTIVE',
        manager: { connect: { id: managerEmployeeId } },
      },
    });
    reportEmployeeId = reportEmployee.id;

    const outsiderUser = await db.user.create({
      data: {
        tenantId: testTenantId,
        email: 'outsider@probation-review-test.com',
        passwordHash: await hashPassword('Outsider@123'),
        fullName: 'Outside Subject',
        role: 'EMPLOYEE',
        roleId: roleIdByKey.get('employee'),
        status: 'ACTIVE',
      },
    });

    const outsiderEmployee = await db.employee.create({
      data: {
        tenant: { connect: { id: testTenantId } },
        user: { connect: { id: outsiderUser.id } },
        employeeCode: 'EMP-002',
        fullName: 'Outside Subject',
        joinDate: new Date('2026-01-01'),
        probationEndDate: new Date('2026-04-01'),
        contractType: 'PROBATION',
        status: 'ACTIVE',
      },
    });
    outsiderEmployeeId = outsiderEmployee.id;

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

    const employeeLogin = await request(app).post('/api/v1/auth/login').send({
      email: SUBJECT_USER_EMAIL,
      password: SUBJECT_USER_PASSWORD,
      tenantSlug: TEST_TENANT_SLUG,
    });
    employeeToken = employeeLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await db.probationReview.deleteMany({ where: { tenantId: testTenantId } });
    await db.probationCriteria.deleteMany({ where: { tenantId: testTenantId } });
    await db.employee.deleteMany({ where: { tenantId: testTenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId: testTenantId } } });
    await db.user.deleteMany({ where: { tenantId: testTenantId } });
    await db.tenant.delete({ where: { id: testTenantId } });
  });

  // Each create-test cleans its own review so the 1-open-review rule stays isolated.
  async function clearReviews() {
    await db.probationReview.deleteMany({ where: { tenantId: testTenantId } });
  }

  describe('POST /api/v1/probation/reviews', () => {
    it('should let a MANAGER open a DRAFT for a direct report (201)', async () => {
      await clearReviews();
      const res = await request(app)
        .post('/api/v1/probation/reviews')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ employeeId: reportEmployeeId });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.employee.id).toBe(reportEmployeeId);
      expect(res.body.data.reviewer.id).toBe(managerEmployeeId);
      // Snapshot of the probation end date at creation time.
      expect(res.body.data.probationEndDateAtCreate).toBeTruthy();
    });

    it('should return 403 when a MANAGER targets a non-report', async () => {
      await clearReviews();
      const res = await request(app)
        .post('/api/v1/probation/reviews')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ employeeId: outsiderEmployeeId });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should let HR open a DRAFT for any probationary employee (201)', async () => {
      await clearReviews();
      const res = await request(app)
        .post('/api/v1/probation/reviews')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: outsiderEmployeeId });

      expect(res.status).toBe(201);
      expect(res.body.data.employee.id).toBe(outsiderEmployeeId);
    });

    it('should block a second open review for the same employee (409 PROBATION_REVIEW_OPEN_EXISTS)', async () => {
      await clearReviews();
      await request(app)
        .post('/api/v1/probation/reviews')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ employeeId: reportEmployeeId });

      const res = await request(app)
        .post('/api/v1/probation/reviews')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ employeeId: reportEmployeeId });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PROBATION_REVIEW_OPEN_EXISTS');
    });

    it('should return 403 for an EMPLOYEE (lacks probation:review)', async () => {
      const res = await request(app)
        .post('/api/v1/probation/reviews')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ employeeId: reportEmployeeId });

      expect(res.status).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post('/api/v1/probation/reviews')
        .send({ employeeId: reportEmployeeId });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/probation/reviews', () => {
    it('should list all reviews for HR', async () => {
      await clearReviews();
      await request(app)
        .post('/api/v1/probation/reviews')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ employeeId: reportEmployeeId });
      await request(app)
        .post('/api/v1/probation/reviews')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: outsiderEmployeeId });

      const res = await request(app)
        .get('/api/v1/probation/reviews')
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should restrict a MANAGER to reviews of their direct reports', async () => {
      // (state from the previous test: one review for the report, one for the outsider)
      const res = await request(app)
        .get('/api/v1/probation/reviews')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      const employeeIds = res.body.data.map((r: { employee: { id: string } }) => r.employee.id);
      expect(employeeIds).toContain(reportEmployeeId);
      expect(employeeIds).not.toContain(outsiderEmployeeId);
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get('/api/v1/probation/reviews?status=DRAFT')
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((r: { status: string }) => r.status === 'DRAFT')).toBe(true);
    });

    it('should return 403 for an EMPLOYEE', async () => {
      const res = await request(app)
        .get('/api/v1/probation/reviews')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/probation/reviews/:id', () => {
    it('should return a review detail for HR (200)', async () => {
      await clearReviews();
      const created = await request(app)
        .post('/api/v1/probation/reviews')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ employeeId: reportEmployeeId });
      const id = created.body.data.id;

      const res = await request(app)
        .get(`/api/v1/probation/reviews/${id}`)
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(id);
      expect(res.body.data.employee.fullName).toBe('Probation Subject');
    });

    it('should let a MANAGER read their report’s review', async () => {
      const created = await db.probationReview.findFirst({
        where: { tenantId: testTenantId, employeeId: reportEmployeeId },
      });
      const res = await request(app)
        .get(`/api/v1/probation/reviews/${created!.id}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
    });

    it('should return 403/404 when a MANAGER reads a non-report’s review', async () => {
      const review = await db.probationReview.create({
        data: { tenantId: testTenantId, employeeId: outsiderEmployeeId, status: 'DRAFT' },
      });

      const res = await request(app)
        .get(`/api/v1/probation/reviews/${review.id}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect([403, 404]).toContain(res.status);
    });

    it('should return 404 for an unknown id', async () => {
      const res = await request(app)
        .get('/api/v1/probation/reviews/nonexistent-id')
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(404);
    });
  });

  // Open a fresh DRAFT for the in-scope report and return its id.
  async function openDraft(): Promise<string> {
    await clearReviews();
    const res = await request(app)
      .post('/api/v1/probation/reviews')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ employeeId: reportEmployeeId });
    return res.body.data.id;
  }

  describe('PATCH /api/v1/probation/reviews/:id (save draft)', () => {
    it('should let the MANAGER save scorecard fields on a DRAFT (200)', async () => {
      const id = await openDraft();
      const res = await request(app)
        .patch(`/api/v1/probation/reviews/${id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ comment: 'Solid first month', recommendation: 'CONFIRM' });

      expect(res.status).toBe(200);
      expect(res.body.data.comment).toBe('Solid first month');
      expect(res.body.data.recommendation).toBe('CONFIRM');
      expect(res.body.data.status).toBe('DRAFT');
    });

    it('should persist ratings across multiple patches', async () => {
      const id = await openDraft();
      await request(app)
        .patch(`/api/v1/probation/reviews/${id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ strengths: 'Communicative' });
      const res = await request(app)
        .patch(`/api/v1/probation/reviews/${id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ weaknesses: 'Needs mentoring' });

      expect(res.status).toBe(200);
      expect(res.body.data.strengths).toBe('Communicative');
      expect(res.body.data.weaknesses).toBe('Needs mentoring');
    });

    it('should return 403 for an EMPLOYEE (lacks probation:review)', async () => {
      const id = await openDraft();
      const res = await request(app)
        .patch(`/api/v1/probation/reviews/${id}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ comment: 'x' });

      expect(res.status).toBe(403);
    });
  });

  // SPEC-031: nhật ký bằng chứng deliverable trên review — sửa khi DRAFT, bất biến sau submit.
  describe('review deliverables (SPEC-031)', () => {
    let soloCriteria: string;

    beforeAll(async () => {
      await db.probationCriteria.deleteMany({ where: { tenantId: testTenantId } });
      const c = await db.probationCriteria.create({
        data: { tenantId: testTenantId, name: 'Deliverable gate', order: 0, isActive: true },
      });
      soloCriteria = c.id;
    });

    const validDeliverables = [
      {
        title: 'Tích hợp SSO Google',
        link: 'https://app.clickup.com/t/abc123',
        outcome: 'MET',
        note: 'Hoàn thành đúng sprint',
      },
      { title: 'Refactor module payroll' },
    ];

    it('should save deliverables on a DRAFT via PATCH (200)', async () => {
      const id = await openDraft();
      const res = await request(app)
        .patch(`/api/v1/probation/reviews/${id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ deliverables: validDeliverables });

      expect(res.status).toBe(200);
      expect(res.body.data.deliverables).toHaveLength(2);
      expect(res.body.data.deliverables[0]).toMatchObject({
        title: 'Tích hợp SSO Google',
        link: 'https://app.clickup.com/t/abc123',
        outcome: 'MET',
      });
      expect(res.body.data.deliverables[1].title).toBe('Refactor module payroll');
    });

    it('should return 422 when a deliverable title is empty', async () => {
      const id = await openDraft();
      const res = await request(app)
        .patch(`/api/v1/probation/reviews/${id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ deliverables: [{ title: '' }] });

      expect(res.status).toBe(422);
    });

    it('should return 422 when a deliverable link is not a valid URL', async () => {
      const id = await openDraft();
      const res = await request(app)
        .patch(`/api/v1/probation/reviews/${id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ deliverables: [{ title: 'Việc A', link: 'not-a-url' }] });

      expect(res.status).toBe(422);
    });

    // XSS: link hiển thị thành <a href> ở view của HR — chỉ chấp nhận http(s),
    // chặn javascript:/data: dù chúng là URL hợp lệ với new URL().
    it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>'])(
      'should return 422 for a non-http(s) deliverable link (%s)',
      async (link) => {
        const id = await openDraft();
        const res = await request(app)
          .patch(`/api/v1/probation/reviews/${id}`)
          .set('Authorization', `Bearer ${managerToken}`)
          .send({ deliverables: [{ title: 'Việc A', link }] });

        expect(res.status).toBe(422);
      }
    );

    it('should return 422 when there are more than 50 deliverables', async () => {
      const id = await openDraft();
      const tooMany = Array.from({ length: 51 }, (_, i) => ({ title: `Việc ${i}` }));
      const res = await request(app)
        .patch(`/api/v1/probation/reviews/${id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ deliverables: tooMany });

      expect(res.status).toBe(422);
    });

    it('should return 422 for an unknown deliverable outcome', async () => {
      const id = await openDraft();
      const res = await request(app)
        .patch(`/api/v1/probation/reviews/${id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ deliverables: [{ title: 'Việc A', outcome: 'MAYBE' }] });

      expect(res.status).toBe(422);
    });

    it('should accept deliverables on submit, then be immutable and visible to HR', async () => {
      const id = await openDraft();
      const submit = await request(app)
        .post(`/api/v1/probation/reviews/${id}/submit`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          ratings: { [soloCriteria]: 4 },
          recommendation: 'CONFIRM',
          deliverables: validDeliverables,
        });

      expect(submit.status).toBe(200);
      expect(submit.body.data.status).toBe('PENDING_HR');
      expect(submit.body.data.deliverables).toHaveLength(2);

      // bất biến sau submit — cùng quy tắc scorecard SPEC-030
      const patchAfter = await request(app)
        .patch(`/api/v1/probation/reviews/${id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ deliverables: [{ title: 'Sửa lén sau nộp' }] });
      expect(patchAfter.status).toBe(409);

      // HR đọc thấy deliverables + link
      const hrRead = await request(app)
        .get(`/api/v1/probation/reviews/${id}`)
        .set('Authorization', `Bearer ${hrToken}`);
      expect(hrRead.status).toBe(200);
      expect(hrRead.body.data.deliverables).toHaveLength(2);
      expect(hrRead.body.data.deliverables[0].link).toBe('https://app.clickup.com/t/abc123');
    });
  });

  describe('POST /api/v1/probation/reviews/:id/submit', () => {
    let criteriaA: string;
    let criteriaB: string;
    let inactiveCriteria: string;

    beforeAll(async () => {
      await db.probationCriteria.deleteMany({ where: { tenantId: testTenantId } });
      const a = await db.probationCriteria.create({
        data: { tenantId: testTenantId, name: 'Quality', order: 0, isActive: true },
      });
      const b = await db.probationCriteria.create({
        data: { tenantId: testTenantId, name: 'Teamwork', order: 1, isActive: true },
      });
      const inactive = await db.probationCriteria.create({
        data: { tenantId: testTenantId, name: 'Old', order: 2, isActive: false },
      });
      criteriaA = a.id;
      criteriaB = b.id;
      inactiveCriteria = inactive.id;
    });

    it('should block submit when not all active criteria are scored (400)', async () => {
      const id = await openDraft();
      const res = await request(app)
        .post(`/api/v1/probation/reviews/${id}/submit`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ ratings: { [criteriaA]: 5 }, recommendation: 'CONFIRM' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PROBATION_INCOMPLETE_SCORECARD');
    });

    it('should reject submit without a recommendation (422)', async () => {
      const id = await openDraft();
      const res = await request(app)
        .post(`/api/v1/probation/reviews/${id}/submit`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ ratings: { [criteriaA]: 5, [criteriaB]: 4 } });

      expect(res.status).toBe(422);
    });

    it('should submit a full scorecard → PENDING_HR (200)', async () => {
      const id = await openDraft();
      const res = await request(app)
        .post(`/api/v1/probation/reviews/${id}/submit`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          ratings: { [criteriaA]: 5, [criteriaB]: 4 },
          recommendation: 'CONFIRM',
          comment: 'Ready',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PENDING_HR');
      expect(res.body.data.submittedAt).toBeTruthy();
      expect(res.body.data.recommendation).toBe('CONFIRM');
      // Inactive criteria need not be scored.
      expect(res.body.data.ratings[inactiveCriteria]).toBeUndefined();
    });

    it('should block EXTEND submit without a future newProbationEndDate (400)', async () => {
      const id = await openDraft();
      const res = await request(app)
        .post(`/api/v1/probation/reviews/${id}/submit`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          ratings: { [criteriaA]: 3, [criteriaB]: 3 },
          recommendation: 'EXTEND',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PROBATION_EXTEND_DATE_REQUIRED');
    });

    it('should submit EXTEND with a valid future date (200)', async () => {
      const id = await openDraft();
      const future = new Date();
      future.setMonth(future.getMonth() + 2);
      const res = await request(app)
        .post(`/api/v1/probation/reviews/${id}/submit`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          ratings: { [criteriaA]: 3, [criteriaB]: 3 },
          recommendation: 'EXTEND',
          newProbationEndDate: future.toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PENDING_HR');
      expect(res.body.data.newProbationEndDate).toBeTruthy();
    });

    it('should lock manager edits after submit — PATCH returns 409', async () => {
      const id = await openDraft();
      await request(app)
        .post(`/api/v1/probation/reviews/${id}/submit`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ ratings: { [criteriaA]: 5, [criteriaB]: 4 }, recommendation: 'CONFIRM' });

      const res = await request(app)
        .patch(`/api/v1/probation/reviews/${id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ comment: 'too late' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PROBATION_REVIEW_NOT_EDITABLE');
    });

    it('should reject submit on an already-submitted review (409)', async () => {
      const id = await openDraft();
      await request(app)
        .post(`/api/v1/probation/reviews/${id}/submit`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ ratings: { [criteriaA]: 5, [criteriaB]: 4 }, recommendation: 'CONFIRM' });

      const res = await request(app)
        .post(`/api/v1/probation/reviews/${id}/submit`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ ratings: { [criteriaA]: 5, [criteriaB]: 4 }, recommendation: 'CONFIRM' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PROBATION_REVIEW_NOT_EDITABLE');
    });
  });

  describe('POST /api/v1/probation/reviews/:id/decide', () => {
    let critA: string;
    let critB: string;

    beforeAll(async () => {
      await db.probationCriteria.deleteMany({ where: { tenantId: testTenantId } });
      const a = await db.probationCriteria.create({
        data: { tenantId: testTenantId, name: 'Quality', order: 0, isActive: true },
      });
      const b = await db.probationCriteria.create({
        data: { tenantId: testTenantId, name: 'Teamwork', order: 1, isActive: true },
      });
      critA = a.id;
      critB = b.id;
    });

    // Reset the subject back to a clean probationary state (prior decisions mutate it).
    async function resetSubject() {
      await db.contract.deleteMany({
        where: { tenantId: testTenantId, employeeId: reportEmployeeId },
      });
      const emp = await db.employee.update({
        where: { id: reportEmployeeId },
        data: {
          contractType: 'PROBATION',
          status: 'ACTIVE',
          terminatedAt: null,
          terminationReason: null,
          probationEndDate: new Date('2026-04-01'),
        },
      });
      await db.user.update({ where: { id: emp.userId }, data: { status: 'ACTIVE' } });
    }

    // Open a DRAFT then submit it → a PENDING_HR review ready for HR to decide.
    async function openSubmitted(recommendation: string = 'CONFIRM'): Promise<string> {
      await resetSubject();
      const id = await openDraft();
      // EXTEND submission requires a proposed future date (business rule).
      const future = new Date();
      future.setMonth(future.getMonth() + 2);
      await request(app)
        .post(`/api/v1/probation/reviews/${id}/submit`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          ratings: { [critA]: 4, [critB]: 5 },
          recommendation,
          ...(recommendation === 'EXTEND' ? { newProbationEndDate: future.toISOString() } : {}),
        });
      return id;
    }

    it('should let HR CONFIRM → create a FULL_TIME contract + flip employee (200)', async () => {
      const id = await openSubmitted('CONFIRM');
      const res = await request(app)
        .post(`/api/v1/probation/reviews/${id}/decide`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ decision: 'CONFIRM', decisionNote: 'Strong hire' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('DECIDED');
      expect(res.body.data.decision).toBe('CONFIRM');
      expect(res.body.data.decidedAt).toBeTruthy();

      // Business outcome: a fresh ACTIVE FULL_TIME contract + employee promoted.
      const contract = await db.contract.findFirst({
        where: { tenantId: testTenantId, employeeId: reportEmployeeId, status: 'ACTIVE' },
      });
      expect(contract?.type).toBe('FULL_TIME');
      const emp = await db.employee.findUnique({ where: { id: reportEmployeeId } });
      expect(emp?.contractType).toBe('FULL_TIME');
    });

    it('should let HR EXTEND → push probationEndDate (200)', async () => {
      const id = await openSubmitted('EXTEND');
      const future = new Date();
      future.setMonth(future.getMonth() + 3);
      const res = await request(app)
        .post(`/api/v1/probation/reviews/${id}/decide`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ decision: 'EXTEND', newProbationEndDate: future.toISOString() });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('DECIDED');

      const emp = await db.employee.findUnique({ where: { id: reportEmployeeId } });
      expect(emp?.contractType).toBe('PROBATION');
      expect(emp?.status).toBe('ACTIVE');
      expect(emp?.probationEndDate?.toISOString().slice(0, 10)).toBe(
        future.toISOString().slice(0, 10),
      );
    });

    it('should reject EXTEND without a future date (400)', async () => {
      const id = await openSubmitted('EXTEND');
      const res = await request(app)
        .post(`/api/v1/probation/reviews/${id}/decide`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ decision: 'EXTEND' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PROBATION_EXTEND_DATE_REQUIRED');
    });

    it('should let HR FAIL → terminate the employee with the note as reason (200)', async () => {
      const id = await openSubmitted('FAIL');
      const res = await request(app)
        .post(`/api/v1/probation/reviews/${id}/decide`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ decision: 'FAIL', decisionNote: 'Did not meet the bar' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('DECIDED');

      const emp = await db.employee.findUnique({ where: { id: reportEmployeeId } });
      expect(emp?.status).toBe('TERMINATED');
      expect(emp?.terminationReason).toBe('Did not meet the bar');
      const user = await db.user.findUnique({ where: { id: emp!.userId } });
      expect(user?.status).toBe('INACTIVE');
    });

    it('should reject FAIL without a decisionNote (400)', async () => {
      const id = await openSubmitted('FAIL');
      const res = await request(app)
        .post(`/api/v1/probation/reviews/${id}/decide`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ decision: 'FAIL' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PROBATION_FAIL_REASON_REQUIRED');
    });

    it('should forbid a MANAGER from deciding (403)', async () => {
      const id = await openSubmitted('CONFIRM');
      const res = await request(app)
        .post(`/api/v1/probation/reviews/${id}/decide`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ decision: 'CONFIRM' });

      expect(res.status).toBe(403);
    });

    it('should reject deciding a review that is not PENDING_HR (409)', async () => {
      await resetSubject();
      const id = await openDraft(); // still DRAFT
      const res = await request(app)
        .post(`/api/v1/probation/reviews/${id}/decide`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ decision: 'CONFIRM' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PROBATION_REVIEW_NOT_DECIDABLE');
    });

    it('should roll back atomically when a consequence fails', async () => {
      const id = await openSubmitted('FAIL');
      // Pre-terminate the employee so terminateWithinTx throws mid-transaction.
      await db.employee.update({
        where: { id: reportEmployeeId },
        data: { status: 'TERMINATED', terminatedAt: new Date() },
      });

      const res = await request(app)
        .post(`/api/v1/probation/reviews/${id}/decide`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ decision: 'FAIL', decisionNote: 'should not stick' });

      expect(res.status).toBe(400);
      // Review must remain PENDING_HR — the whole decision rolled back.
      const review = await db.probationReview.findUnique({ where: { id } });
      expect(review?.status).toBe('PENDING_HR');
      expect(review?.decision).toBeNull();
    });
  });

  describe('POST /api/v1/probation/reviews/:id/cancel', () => {
    it('should cancel an open (PENDING_HR) review (200)', async () => {
      const review = await db.probationReview.create({
        data: { tenantId: testTenantId, employeeId: reportEmployeeId, status: 'PENDING_HR' },
      });
      const res = await request(app)
        .post(`/api/v1/probation/reviews/${review.id}/cancel`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');
    });

    it('should reject cancelling a DECIDED review (409)', async () => {
      const review = await db.probationReview.create({
        data: {
          tenantId: testTenantId,
          employeeId: reportEmployeeId,
          status: 'DECIDED',
          decision: 'CONFIRM',
          decidedAt: new Date(),
        },
      });
      const res = await request(app)
        .post(`/api/v1/probation/reviews/${review.id}/cancel`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PROBATION_REVIEW_NOT_CANCELLABLE');
    });
  });
});
