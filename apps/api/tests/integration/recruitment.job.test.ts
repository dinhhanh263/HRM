import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

const TENANT_SLUG = 'recruitment-job-tenant';
const HR_EMAIL = 'hr@recruitment-job.com';
const HR_PASSWORD = 'HrTest@123';
const NOACCESS_EMAIL = 'noaccess@recruitment-job.com';
const NOACCESS_PASSWORD = 'NoAccess@123';

const validStages = [
  { name: 'Ứng viên mới', order: 0, type: 'SOURCED' },
  { name: 'Phỏng vấn', order: 1, type: 'INTERVIEW' },
  { name: 'Đã tuyển', order: 2, type: 'HIRED' },
  { name: 'Từ chối', order: 3, type: 'REJECTED' },
];

async function cleanup(tenantId: string) {
  await db.job.deleteMany({ where: { tenantId } });
  await db.pipelineTemplate.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.department.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

describe('Recruitment API — jobs', () => {
  let tenantId: string;
  let hrToken: string;
  let noAccessToken: string;
  let templateId: string;
  let engDeptId: string;
  let salesDeptId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Recruitment Job Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;
    await cleanup(tenantId);

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);

    const hrUser = await db.user.create({
      data: {
        tenantId,
        email: HR_EMAIL,
        passwordHash: await hashPassword(HR_PASSWORD),
        fullName: 'HR Manager',
        role: 'HR_MANAGER',
        roleId: roleIdByKey.get('hr_manager'),
        status: 'ACTIVE',
      },
    });
    // Jobs are owned by the creator's Employee profile.
    await db.employee.create({
      data: {
        tenantId,
        userId: hrUser.id,
        employeeCode: 'HR-001',
        fullName: 'HR Manager',
        joinDate: new Date('2024-01-01'),
        contractType: 'FULL_TIME',
      },
    });

    const noAccessRole = await db.role.create({
      data: { tenantId, key: 'no-access', name: 'No Access', isSystem: false },
    });
    await db.user.create({
      data: {
        tenantId,
        email: NOACCESS_EMAIL,
        passwordHash: await hashPassword(NOACCESS_PASSWORD),
        fullName: 'No Access',
        role: 'EMPLOYEE',
        roleId: noAccessRole.id,
        status: 'ACTIVE',
      },
    });

    const eng = await db.department.create({ data: { tenantId, name: 'Kỹ thuật' } });
    const sales = await db.department.create({ data: { tenantId, name: 'Kinh doanh' } });
    engDeptId = eng.id;
    salesDeptId = sales.id;

    const template = await db.pipelineTemplate.create({
      data: {
        tenantId,
        name: 'Quy trình test',
        isDefault: true,
        stages: { create: validStages },
      },
    });
    templateId = template.id;

    const hrLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: HR_EMAIL, password: HR_PASSWORD, tenantSlug: TENANT_SLUG });
    hrToken = hrLogin.body.data.accessToken;

    const noAccessLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: NOACCESS_EMAIL, password: NOACCESS_PASSWORD, tenantSlug: TENANT_SLUG });
    noAccessToken = noAccessLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await cleanup(tenantId);
    await db.tenant.delete({ where: { id: tenantId } });
  });

  it('creates a job and clones the pipeline template stages', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/jobs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        title: 'Senior Backend Engineer',
        departmentId: engDeptId,
        employmentType: 'FULL_TIME',
        location: 'Hà Nội',
        headcount: 2,
        pipelineTemplateId: templateId,
        status: 'OPEN',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('OPEN');
    expect(res.body.data.openedAt).not.toBeNull();
    // Cloned stages must mirror the template exactly.
    const types = res.body.data.stages.map((s: { type: string }) => s.type);
    expect(types).toEqual(['SOURCED', 'INTERVIEW', 'HIRED', 'REJECTED']);
    expect(res.body.data.stageCount).toBe(4);
    expect(res.body.data.activeApplicationCount).toBe(0);
    expect(res.body.data.department.name).toBe('Kỹ thuật');
  });

  it('cloned stages are independent of later template edits', async () => {
    const create = await request(app)
      .post('/api/v1/recruitment/jobs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ title: 'Clone Independence', pipelineTemplateId: templateId });
    const jobId = create.body.data.id;
    const originalCount = create.body.data.stages.length;

    // Mutate the template directly — the existing job must not change.
    await db.pipelineTemplateStage.create({
      data: { templateId, name: 'Bài test', order: 4, type: 'ASSESSMENT' },
    });

    const after = await request(app)
      .get(`/api/v1/recruitment/jobs/${jobId}`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(after.body.data.stages.length).toBe(originalCount);
  });

  it('defaults to DRAFT status with no openedAt when status omitted', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/jobs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ title: 'Draft Role', pipelineTemplateId: templateId });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.openedAt).toBeNull();
  });

  it('rejects creation with an unknown pipeline template (404)', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/jobs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ title: 'No Pipeline', pipelineTemplateId: 'does-not-exist' });
    expect(res.status).toBe(404);
  });

  it('filters jobs by department and by search term', async () => {
    await request(app)
      .post('/api/v1/recruitment/jobs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ title: 'Sales Executive', departmentId: salesDeptId, pipelineTemplateId: templateId });

    const byDept = await request(app)
      .get(`/api/v1/recruitment/jobs?departmentId=${salesDeptId}`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(byDept.status).toBe(200);
    expect(byDept.body.data.every((j: { departmentId: string }) => j.departmentId === salesDeptId)).toBe(true);
    expect(byDept.body.data.some((j: { title: string }) => j.title === 'Sales Executive')).toBe(true);

    const bySearch = await request(app)
      .get('/api/v1/recruitment/jobs?search=backend')
      .set('Authorization', `Bearer ${hrToken}`);
    expect(bySearch.body.data.some((j: { title: string }) => j.title === 'Senior Backend Engineer')).toBe(true);
    expect(bySearch.body.data.some((j: { title: string }) => j.title === 'Sales Executive')).toBe(false);
  });

  it('closes then reopens a job, managing openedAt/closedAt', async () => {
    const create = await request(app)
      .post('/api/v1/recruitment/jobs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ title: 'Lifecycle Role', pipelineTemplateId: templateId, status: 'OPEN' });
    const jobId = create.body.data.id;

    const closed = await request(app)
      .patch(`/api/v1/recruitment/jobs/${jobId}/status`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ status: 'CLOSED' });
    expect(closed.status).toBe(200);
    expect(closed.body.data.status).toBe('CLOSED');
    expect(closed.body.data.closedAt).not.toBeNull();

    const reopened = await request(app)
      .patch(`/api/v1/recruitment/jobs/${jobId}/status`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ status: 'OPEN' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.data.status).toBe('OPEN');
    expect(reopened.body.data.closedAt).toBeNull();
  });

  it('rejects an illegal status transition (409)', async () => {
    const create = await request(app)
      .post('/api/v1/recruitment/jobs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ title: 'Bad Transition', pipelineTemplateId: templateId });
    const jobId = create.body.data.id;

    // DRAFT cannot jump straight to CLOSED.
    const res = await request(app)
      .patch(`/api/v1/recruitment/jobs/${jobId}/status`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ status: 'CLOSED' });
    expect(res.status).toBe(409);
  });

  it('updates editable job fields', async () => {
    const create = await request(app)
      .post('/api/v1/recruitment/jobs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ title: 'Editable Role', pipelineTemplateId: templateId, headcount: 1 });
    const jobId = create.body.data.id;

    const res = await request(app)
      .patch(`/api/v1/recruitment/jobs/${jobId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ title: 'Editable Role v2', headcount: 5, location: 'Remote' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Editable Role v2');
    expect(res.body.data.headcount).toBe(5);
    expect(res.body.data.location).toBe('Remote');
  });

  it('returns 404 for an unknown job id', async () => {
    const res = await request(app)
      .get('/api/v1/recruitment/jobs/non-existent-id')
      .set('Authorization', `Bearer ${hrToken}`);
    expect(res.status).toBe(404);
  });

  it('blocks job creation without recruitment:job_create (403)', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/jobs')
      .set('Authorization', `Bearer ${noAccessToken}`)
      .send({ title: 'Nope', pipelineTemplateId: templateId });
    expect(res.status).toBe(403);

    const list = await request(app)
      .get('/api/v1/recruitment/jobs')
      .set('Authorization', `Bearer ${noAccessToken}`);
    expect(list.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/v1/recruitment/jobs');
    expect(res.status).toBe(401);
  });
});
