import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';
import { seedDefaultSalesRolesForTenant, seedDefaultSalesPipelineForTenant } from '../../src/domain/sales/defaults.js';

// SPEC-045 Task 5.1 — Sales reports (overview + weighted forecast + owner scope).
const SLUG = 'sales-report-tenant';
const ADMIN = { email: 'admin@salesreport.com', password: 'Admin@123' };
const REP = { email: 'rep@salesreport.com', password: 'Rep@12345' };

async function cleanup(tenantId: string) {
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

describe('Sales reports (overview + forecast + scope)', () => {
  let tenantId: string;
  let adminToken: string;
  let repToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'Sales Report', slug: SLUG } });
    tenantId = tenant.id;
    await cleanup(tenantId);
    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);
    await seedDefaultSalesRolesForTenant(db, tenantId);
    await seedDefaultSalesPipelineForTenant(db, tenantId);
    const repRole = await db.role.findFirstOrThrow({ where: { tenantId, key: 'sales_rep' } });

    const adminUser = await db.user.create({ data: { tenantId, email: ADMIN.email, passwordHash: await hashPassword(ADMIN.password), fullName: 'Admin', role: 'SUPER_ADMIN', roleId: roleIds.get('super_admin'), status: 'ACTIVE' } });
    const adminEmp = await db.employee.create({ data: { tenantId, userId: adminUser.id, employeeCode: 'ADM', fullName: 'Admin', joinDate: new Date(), contractType: 'FULL_TIME' } });
    const repUser = await db.user.create({ data: { tenantId, email: REP.email, passwordHash: await hashPassword(REP.password), fullName: 'Rep', role: 'EMPLOYEE', roleId: repRole.id, status: 'ACTIVE' } });
    await db.employee.create({ data: { tenantId, userId: repUser.id, employeeCode: 'REP', fullName: 'Rep', joinDate: new Date(), contractType: 'FULL_TIME' } });

    const pipeline = await db.salesPipeline.findFirstOrThrow({ where: { tenantId, isDefault: true }, include: { stages: true } });
    const proposal = pipeline.stages.find((s) => s.type === 'PROPOSAL')!; // probability 50
    const cust = await db.customer.create({ data: { tenantId, type: 'B2B', fullName: 'RepCo', lifecycleStatus: 'QUALIFIED', ownerId: adminEmp.id } });
    await db.deal.create({ data: { tenantId, customerId: cust.id, pipelineId: pipeline.id, currentStageId: proposal.id, ownerId: adminEmp.id, title: 'Open deal', amount: '10000000', status: 'OPEN' } });
    await db.deal.create({ data: { tenantId, customerId: cust.id, pipelineId: pipeline.id, currentStageId: proposal.id, ownerId: adminEmp.id, title: 'Won deal', amount: '5000000', status: 'WON', wonAt: new Date() } });

    adminToken = await login(ADMIN.email, ADMIN.password);
    repToken = await login(REP.email, REP.password);
  });

  it('overview returns lifecycle counts, pipeline value, and won-this-month', async () => {
    const res = await request(app).get('/api/v1/sales/reports/overview').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.lifecycleCounts.QUALIFIED).toBe(1);
    expect(res.body.data.openPipelineTotal).toBe('10000000');
    expect(res.body.data.wonThisMonth.count).toBe(1);
    expect(res.body.data.wonThisMonth.amount).toBe('5000000');
  });

  it('forecast weights OPEN deals by stage probability (10M × 50% = 5M)', async () => {
    const res = await request(app).get('/api/v1/sales/reports/forecast').set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.weightedTotal).toBe('5000000');
  });

  it('a rep without view_all sees only their own (empty here) data', async () => {
    const res = await request(app).get('/api/v1/sales/reports/overview').set('Authorization', `Bearer ${repToken}`);
    expect(res.body.data.openPipelineTotal).toBe('0'); // deals owned by admin, not rep
  });

  it('by-owner requires view_all → rep gets 403, admin gets data', async () => {
    const repRes = await request(app).get('/api/v1/sales/reports/by-owner').set('Authorization', `Bearer ${repToken}`);
    expect(repRes.status).toBe(403);
    const adminRes = await request(app).get('/api/v1/sales/reports/by-owner').set('Authorization', `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data.length).toBeGreaterThanOrEqual(1);
  });
});
