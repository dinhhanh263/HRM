import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';
import { seedDefaultSalesRolesForTenant, seedDefaultSalesPipelineForTenant } from '../../src/domain/sales/defaults.js';

// SPEC-045 Phase 2 — Deal CRUD + Kanban move (history) + Win/Lose (→ lifecycle) + stage config.
const SLUG = 'sales-deal-tenant';
const ADMIN = { email: 'admin@salesdeal.com', password: 'Admin@123' };
const REP_A = { email: 'repa@salesdeal.com', password: 'RepA@1234' };
const REP_B = { email: 'repb@salesdeal.com', password: 'RepB@1234' };

async function cleanup(tenantId: string) {
  await db.dealStageHistory.deleteMany({ where: { deal: { tenantId } } });
  await db.salesActivity.deleteMany({ where: { tenantId } });
  await db.deal.deleteMany({ where: { tenantId } });
  await db.customer.deleteMany({ where: { tenantId } });
  await db.salesStage.deleteMany({ where: { pipeline: { tenantId } } });
  await db.salesPipeline.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password, tenantSlug: SLUG });
  return res.body.data.accessToken;
}
async function makeRep(tenantId: string, roleId: string, email: string, password: string, code: string) {
  const user = await db.user.create({ data: { tenantId, email, passwordHash: await hashPassword(password), fullName: email, role: 'EMPLOYEE', roleId, status: 'ACTIVE' } });
  const emp = await db.employee.create({ data: { tenantId, userId: user.id, employeeCode: code, fullName: email, joinDate: new Date(), contractType: 'FULL_TIME' } });
  return emp.id;
}

describe('Sales deals (CRUD + move/history + win/lose + stage config)', () => {
  let tenantId: string;
  let adminToken: string;
  let repAToken: string;
  let repBToken: string;
  let repAId: string;
  let pipelineId: string;
  let stages: { id: string; type: string; name: string }[];
  let customerId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'Sales Deal', slug: SLUG } });
    tenantId = tenant.id;
    await cleanup(tenantId);
    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);
    await seedDefaultSalesRolesForTenant(db, tenantId);
    await seedDefaultSalesPipelineForTenant(db, tenantId);
    const repRole = await db.role.findFirstOrThrow({ where: { tenantId, key: 'sales_rep' } });

    await db.user.create({ data: { tenantId, email: ADMIN.email, passwordHash: await hashPassword(ADMIN.password), fullName: 'Admin', role: 'SUPER_ADMIN', roleId: roleIds.get('super_admin'), status: 'ACTIVE' } });
    repAId = await makeRep(tenantId, repRole.id, REP_A.email, REP_A.password, 'RA');
    await makeRep(tenantId, repRole.id, REP_B.email, REP_B.password, 'RB');
    adminToken = await login(ADMIN.email, ADMIN.password);
    repAToken = await login(REP_A.email, REP_A.password);
    repBToken = await login(REP_B.email, REP_B.password);

    const pipeline = await db.salesPipeline.findFirstOrThrow({ where: { tenantId, isDefault: true }, include: { stages: { orderBy: { order: 'asc' } } } });
    pipelineId = pipeline.id;
    stages = pipeline.stages;
    const cust = await db.customer.create({ data: { tenantId, type: 'B2B', fullName: 'Deal Customer', lifecycleStatus: 'QUALIFIED', ownerId: repAId } });
    customerId = cust.id;
  });

  let dealId: string;

  it('creates a deal at the first stage, owned by the given rep', async () => {
    const res = await request(app).post('/api/v1/sales/deals').set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Bán gói SaaS', customerId, pipelineId, ownerId: repAId });
    expect(res.status).toBe(201);
    expect(res.body.data.stage.type).toBe('NEW');
    expect(res.body.data.ownerId).toBe(repAId);
    expect(res.body.data.amount).toBe('0');
    dealId = res.body.data.id;
  });

  it('moves a deal to a new stage → records history + STAGE_CHANGED activity', async () => {
    const proposal = stages.find((s) => s.type === 'PROPOSAL')!;
    const res = await request(app).post(`/api/v1/sales/deals/${dealId}/move`).set('Authorization', `Bearer ${repAToken}`)
      .send({ toStageId: proposal.id });
    expect(res.status).toBe(200);
    expect(res.body.data.stage.type).toBe('PROPOSAL');
    const history = await db.dealStageHistory.findMany({ where: { dealId } });
    expect(history).toHaveLength(1);
    expect(history[0].toStageId).toBe(proposal.id);
    const act = await db.salesActivity.findMany({ where: { dealId, type: 'STAGE_CHANGED' } });
    expect(act).toHaveLength(1);
  });

  it('winning a deal sets WON + pushes the customer lifecycle to CUSTOMER', async () => {
    const res = await request(app).post(`/api/v1/sales/deals/${dealId}/win`).set('Authorization', `Bearer ${repAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('WON');
    expect(res.body.data.wonAt).toBeTruthy();
    const cust = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(cust.lifecycleStatus).toBe('CUSTOMER');
  });

  it('losing a deal requires + stores a lostReason', async () => {
    const created = await request(app).post('/api/v1/sales/deals').set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Deal thua', customerId, pipelineId, ownerId: repAId });
    const id = created.body.data.id;
    const noReason = await request(app).post(`/api/v1/sales/deals/${id}/lose`).set('Authorization', `Bearer ${repAToken}`).send({});
    expect(noReason.status).toBe(422);
    const res = await request(app).post(`/api/v1/sales/deals/${id}/lose`).set('Authorization', `Bearer ${repAToken}`).send({ lostReason: 'Giá cao' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('LOST');
    expect(res.body.data.lostReason).toBe('Giá cao');
  });

  it('owner-scope: rep B does not see rep A’s deals', async () => {
    const res = await request(app).get('/api/v1/sales/deals').set('Authorization', `Bearer ${repBToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    const adminList = await request(app).get('/api/v1/sales/deals').set('Authorization', `Bearer ${adminToken}`);
    expect(adminList.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('stage config: create a stage, block deleting a stage in use, delete an unused one', async () => {
    const created = await request(app).post(`/api/v1/sales/pipelines/${pipelineId}/stages`).set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Demo', type: 'QUALIFYING', probability: 30 });
    expect(created.status).toBe(201);
    const newStageId = created.body.data.id;

    // The PROPOSAL stage now has history → cannot delete.
    const proposal = stages.find((s) => s.type === 'PROPOSAL')!;
    const blocked = await request(app).delete(`/api/v1/sales/pipelines/${pipelineId}/stages/${proposal.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('STAGE_IN_USE');

    // The brand-new stage is unused → deletable.
    const ok = await request(app).delete(`/api/v1/sales/pipelines/${pipelineId}/stages/${newStageId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(ok.status).toBe(204);
  });
});
