import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';
import { seedDefaultSalesRolesForTenant } from '../../src/domain/sales/defaults.js';

// SPEC-045 Task 1.2 — Lead Pool + claim / assign / bulk-assign + OWNER_CHANGED activity.
const SLUG = 'sales-assign-tenant';
const ADMIN = { email: 'admin@salesassign.com', password: 'Admin@123' };
const REP_A = { email: 'repa@salesassign.com', password: 'RepA@1234' };
const REP_B = { email: 'repb@salesassign.com', password: 'RepB@1234' };

async function cleanup(tenantId: string) {
  await db.salesActivity.deleteMany({ where: { tenantId } });
  await db.customer.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password, tenantSlug: SLUG });
  if (!res.body?.data?.accessToken) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

async function makeRep(tenantId: string, roleId: string, email: string, password: string, code: string) {
  const user = await db.user.create({
    data: { tenantId, email, passwordHash: await hashPassword(password), fullName: email, role: 'EMPLOYEE', roleId, status: 'ACTIVE' },
  });
  const emp = await db.employee.create({
    data: { tenantId, userId: user.id, employeeCode: code, fullName: email, joinDate: new Date(), contractType: 'FULL_TIME' },
  });
  return emp.id;
}

describe('Sales assignment (Lead Pool claim / assign / bulk / OWNER_CHANGED)', () => {
  let tenantId: string;
  let adminToken: string;
  let repAToken: string;
  let repAId: string;
  let repBId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'Sales Assign', slug: SLUG } });
    tenantId = tenant.id;
    await cleanup(tenantId);

    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);
    await seedDefaultSalesRolesForTenant(db, tenantId);
    const repRole = await db.role.findFirstOrThrow({ where: { tenantId, key: 'sales_rep' } });

    await db.user.create({
      data: { tenantId, email: ADMIN.email, passwordHash: await hashPassword(ADMIN.password), fullName: 'Admin', role: 'SUPER_ADMIN', roleId: roleIds.get('super_admin'), status: 'ACTIVE' },
    });
    repAId = await makeRep(tenantId, repRole.id, REP_A.email, REP_A.password, 'REPA');
    repBId = await makeRep(tenantId, repRole.id, REP_B.email, REP_B.password, 'REPB');

    adminToken = await login(ADMIN.email, ADMIN.password);
    repAToken = await login(REP_A.email, REP_A.password);
  });

  /** Create an unassigned pool lead (admin has no employee → ownerId null). */
  async function createPoolLead(name: string): Promise<string> {
    const res = await request(app)
      .post('/api/v1/sales/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'B2C', fullName: name });
    expect(res.body.data.ownerId).toBeNull();
    return res.body.data.id;
  }

  it('rep claims a Lead Pool record → becomes owner + OWNER_CHANGED activity logged', async () => {
    const id = await createPoolLead('Claim Me');
    const res = await request(app).post(`/api/v1/sales/customers/${id}/claim`).set('Authorization', `Bearer ${repAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.ownerId).toBe(repAId);
    expect(res.body.data.assignedAt).toBeTruthy();

    const acts = await db.salesActivity.findMany({ where: { customerId: id, type: 'OWNER_CHANGED' } });
    expect(acts).toHaveLength(1);
    expect(acts[0].body).toContain('Lead Pool');
    expect(acts[0].authorId).toBe(repAId);
  });

  it('claiming a lead already owned by someone else → 409', async () => {
    const id = await createPoolLead('Owned Already');
    await request(app).post(`/api/v1/sales/customers/${id}/assign`).set('Authorization', `Bearer ${adminToken}`).send({ ownerId: repBId });
    const res = await request(app).post(`/api/v1/sales/customers/${id}/claim`).set('Authorization', `Bearer ${repAToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CUSTOMER_ALREADY_OWNED');
  });

  it('admin reassigns rep A’s lead to rep B → owner changes + 2 OWNER_CHANGED entries total', async () => {
    const id = await createPoolLead('Reassign Me');
    await request(app).post(`/api/v1/sales/customers/${id}/assign`).set('Authorization', `Bearer ${adminToken}`).send({ ownerId: repAId });
    const res = await request(app).post(`/api/v1/sales/customers/${id}/assign`).set('Authorization', `Bearer ${adminToken}`).send({ ownerId: repBId });
    expect(res.status).toBe(200);
    expect(res.body.data.ownerId).toBe(repBId);

    const acts = await db.salesActivity.findMany({ where: { customerId: id, type: 'OWNER_CHANGED' }, orderBy: { occurredAt: 'asc' } });
    expect(acts).toHaveLength(2); // pool→A, A→B
  });

  it('a rep (no customer_assign) cannot assign to another owner → 403', async () => {
    const id = await createPoolLead('No Assign');
    const res = await request(app).post(`/api/v1/sales/customers/${id}/assign`).set('Authorization', `Bearer ${repAToken}`).send({ ownerId: repBId });
    expect(res.status).toBe(403);
  });

  it('bulk-assign moves many leads to one owner', async () => {
    const ids = await Promise.all([createPoolLead('Bulk 1'), createPoolLead('Bulk 2')]);
    const res = await request(app)
      .post('/api/v1/sales/customers/bulk-assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerIds: ids, ownerId: repAId });
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(2);
    const owned = await db.customer.findMany({ where: { id: { in: ids } }, select: { ownerId: true } });
    expect(owned.every((c) => c.ownerId === repAId)).toBe(true);
  });

  it('assign with ownerId null sends a lead back to the Lead Pool', async () => {
    const id = await createPoolLead('To Pool');
    await request(app).post(`/api/v1/sales/customers/${id}/assign`).set('Authorization', `Bearer ${adminToken}`).send({ ownerId: repAId });
    const res = await request(app).post(`/api/v1/sales/customers/${id}/assign`).set('Authorization', `Bearer ${adminToken}`).send({ ownerId: null });
    expect(res.status).toBe(200);
    expect(res.body.data.ownerId).toBeNull();
    expect(res.body.data.assignedAt).toBeNull();
  });
});
