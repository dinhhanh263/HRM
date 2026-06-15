import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

const TENANT_SLUG = 'recruitment-pt-tenant';
const HR_EMAIL = 'hr@recruitment-pt.com';
const HR_PASSWORD = 'HrTest@123';
const NOACCESS_EMAIL = 'noaccess@recruitment-pt.com';
const NOACCESS_PASSWORD = 'NoAccess@123';

const validStages = [
  { name: 'Ứng viên mới', order: 0, type: 'SOURCED' },
  { name: 'Phỏng vấn', order: 1, type: 'INTERVIEW' },
  { name: 'Đã tuyển', order: 2, type: 'HIRED' },
  { name: 'Từ chối', order: 3, type: 'REJECTED' },
];

async function cleanup(tenantId: string) {
  await db.pipelineTemplate.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

describe('Recruitment API — pipeline templates', () => {
  let tenantId: string;
  let hrToken: string;
  let noAccessToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Recruitment PT Tenant', slug: TENANT_SLUG },
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
        fullName: 'HR Manager',
        role: 'HR_MANAGER',
        roleId: roleIdByKey.get('hr_manager'),
        status: 'ACTIVE',
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

  it('creates a template and normalizes stage order to 0..n-1', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/pipeline-templates')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        name: 'Quy trình A',
        isDefault: true,
        // intentionally non-contiguous orders to prove normalization
        stages: [
          { name: 'Đã tuyển', order: 50, type: 'HIRED' },
          { name: 'Ứng viên mới', order: 10, type: 'SOURCED' },
          { name: 'Từ chối', order: 99, type: 'REJECTED' },
          { name: 'Phỏng vấn', order: 20, type: 'INTERVIEW' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isDefault).toBe(true);
    const orders = res.body.data.stages.map((s: { order: number }) => s.order);
    expect(orders).toEqual([0, 1, 2, 3]);
    const types = res.body.data.stages.map((s: { type: string }) => s.type);
    expect(types).toEqual(['SOURCED', 'INTERVIEW', 'HIRED', 'REJECTED']);
  });

  it('rejects a pipeline missing the terminal HIRED stage with 422', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/pipeline-templates')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        name: 'Thiếu HIRED',
        stages: [
          { name: 'Ứng viên mới', order: 0, type: 'SOURCED' },
          { name: 'Từ chối', order: 1, type: 'REJECTED' },
        ],
      });
    expect(res.status).toBe(422);
  });

  it('rejects a duplicate template name with 409', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/pipeline-templates')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ name: 'Quy trình A', stages: validStages });
    expect(res.status).toBe(409);
  });

  it('lists templates with default first', async () => {
    await request(app)
      .post('/api/v1/recruitment/pipeline-templates')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ name: 'Quy trình B', stages: validStages });

    const res = await request(app)
      .get('/api/v1/recruitment/pipeline-templates')
      .set('Authorization', `Bearer ${hrToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data[0].isDefault).toBe(true);
    expect(res.body.data[0].name).toBe('Quy trình A');
  });

  it('promoting a new default unsets the previous default', async () => {
    const list = await request(app)
      .get('/api/v1/recruitment/pipeline-templates')
      .set('Authorization', `Bearer ${hrToken}`);
    const b = list.body.data.find((t: { name: string }) => t.name === 'Quy trình B');

    const res = await request(app)
      .patch(`/api/v1/recruitment/pipeline-templates/${b.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ isDefault: true });
    expect(res.status).toBe(200);
    expect(res.body.data.isDefault).toBe(true);

    const after = await request(app)
      .get('/api/v1/recruitment/pipeline-templates')
      .set('Authorization', `Bearer ${hrToken}`);
    const defaults = after.body.data.filter((t: { isDefault: boolean }) => t.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].name).toBe('Quy trình B');
  });

  it('cannot delete the default template (409) but can delete a non-default', async () => {
    const list = await request(app)
      .get('/api/v1/recruitment/pipeline-templates')
      .set('Authorization', `Bearer ${hrToken}`);
    const def = list.body.data.find((t: { isDefault: boolean }) => t.isDefault);
    const nonDefault = list.body.data.find((t: { isDefault: boolean }) => !t.isDefault);

    const blocked = await request(app)
      .delete(`/api/v1/recruitment/pipeline-templates/${def.id}`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(blocked.status).toBe(409);

    const ok = await request(app)
      .delete(`/api/v1/recruitment/pipeline-templates/${nonDefault.id}`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(ok.status).toBe(200);
  });

  it('returns 404 for an unknown template id', async () => {
    const res = await request(app)
      .get('/api/v1/recruitment/pipeline-templates/non-existent-id')
      .set('Authorization', `Bearer ${hrToken}`);
    expect(res.status).toBe(404);
  });

  it('blocks a user without recruitment:job_update with 403', async () => {
    const res = await request(app)
      .get('/api/v1/recruitment/pipeline-templates')
      .set('Authorization', `Bearer ${noAccessToken}`);
    expect(res.status).toBe(403);

    const createRes = await request(app)
      .post('/api/v1/recruitment/pipeline-templates')
      .set('Authorization', `Bearer ${noAccessToken}`)
      .send({ name: 'Nope', stages: validStages });
    expect(createRes.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/v1/recruitment/pipeline-templates');
    expect(res.status).toBe(401);
  });
});
