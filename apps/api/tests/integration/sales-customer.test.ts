import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';
import { seedDefaultSalesRolesForTenant } from '../../src/domain/sales/defaults.js';

// SPEC-045 Task 1.1 — Customer CRUD: owner-scope + dedupe.
//   - rep (no sales:view_all) sees only own records + the unassigned Lead Pool
//   - admin (SUPER_ADMIN / view_all) sees the whole tenant
//   - create dedupes on email / normalized phone → 409 CUSTOMER_DUPLICATE
const SLUG = 'sales-cust-tenant';
const ADMIN = { email: 'admin@salescust.com', password: 'Admin@123' };
const REP_A = { email: 'repa@salescust.com', password: 'RepA@1234' };
const REP_B = { email: 'repb@salescust.com', password: 'RepB@1234' };

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
  if (!res.body?.data?.accessToken) throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

/** Create a sales_rep user + linked Employee; returns the employeeId. */
async function makeRep(tenantId: string, repRoleId: string, email: string, password: string, code: string) {
  const user = await db.user.create({
    data: { tenantId, email, passwordHash: await hashPassword(password), fullName: email, role: 'EMPLOYEE', roleId: repRoleId, status: 'ACTIVE' },
  });
  const emp = await db.employee.create({
    data: { tenantId, userId: user.id, employeeCode: code, fullName: email, joinDate: new Date(), contractType: 'FULL_TIME' },
  });
  return emp.id;
}

describe('Sales Customer routes (owner-scope + dedupe)', () => {
  let tenantId: string;
  let adminToken: string;
  let repAToken: string;
  let repBToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'Sales Cust', slug: SLUG } });
    tenantId = tenant.id;
    await cleanup(tenantId);

    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);
    await seedDefaultSalesRolesForTenant(db, tenantId);
    const repRole = await db.role.findFirstOrThrow({ where: { tenantId, key: 'sales_rep' } });

    // Admin: SUPER_ADMIN, NO employee profile → creates land in the Lead Pool.
    await db.user.create({
      data: { tenantId, email: ADMIN.email, passwordHash: await hashPassword(ADMIN.password), fullName: 'Admin', role: 'SUPER_ADMIN', roleId: roleIds.get('super_admin'), status: 'ACTIVE' },
    });
    await makeRep(tenantId, repRole.id, REP_A.email, REP_A.password, 'REPA');
    await makeRep(tenantId, repRole.id, REP_B.email, REP_B.password, 'REPB');

    adminToken = await login(ADMIN.email, ADMIN.password);
    repAToken = await login(REP_A.email, REP_A.password);
    repBToken = await login(REP_B.email, REP_B.password);
  });

  it('rep creating a lead owns it; phone is normalized to E.164', async () => {
    const res = await request(app)
      .post('/api/v1/sales/customers')
      .set('Authorization', `Bearer ${repAToken}`)
      .send({ type: 'B2C', fullName: 'Alice Nguyen', email: 'alice@buyer.com', phone: '090 123 4567' });
    expect(res.status).toBe(201);
    expect(res.body.data.ownerId).toBeTruthy();
    expect(res.body.data.owner?.fullName).toBe(REP_A.email);
    expect(res.body.data.phone).toBe('+84901234567');
    expect(res.body.data.lifecycleStatus).toBe('NEW');
  });

  it('rejects a duplicate email with 409 CUSTOMER_DUPLICATE carrying the existing record', async () => {
    const res = await request(app)
      .post('/api/v1/sales/customers')
      .set('Authorization', `Bearer ${repAToken}`)
      .send({ type: 'B2C', fullName: 'Alice Dup', email: 'ALICE@buyer.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CUSTOMER_DUPLICATE');
    expect(res.body.error.details.matchedField).toBe('email');
    expect(res.body.error.details.existingName).toBe('Alice Nguyen');
  });

  it('rejects a duplicate normalized phone even if formatted differently', async () => {
    const res = await request(app)
      .post('/api/v1/sales/customers')
      .set('Authorization', `Bearer ${repAToken}`)
      .send({ type: 'B2C', fullName: 'Phone Dup', phone: '0901234567' });
    expect(res.status).toBe(409);
    expect(res.body.error.details.matchedField).toBe('phone');
  });

  it('admin (no employee) creates a lead that lands in the Lead Pool (ownerId null)', async () => {
    const res = await request(app)
      .post('/api/v1/sales/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'B2B', fullName: 'Pool Lead', email: 'pool@buyer.com' });
    expect(res.status).toBe(201);
    expect(res.body.data.ownerId).toBeNull();
  });

  it('rep B sees own + Lead Pool, but NOT rep A’s customer', async () => {
    // rep B creates their own lead.
    await request(app)
      .post('/api/v1/sales/customers')
      .set('Authorization', `Bearer ${repBToken}`)
      .send({ type: 'B2C', fullName: 'Bob Buyer', email: 'bob@buyer.com' });

    const res = await request(app).get('/api/v1/sales/customers').set('Authorization', `Bearer ${repBToken}`);
    expect(res.status).toBe(200);
    const names = res.body.data.items.map((c: { fullName: string }) => c.fullName).sort();
    expect(names).toContain('Bob Buyer'); // own
    expect(names).toContain('Pool Lead'); // unassigned pool
    expect(names).not.toContain('Alice Nguyen'); // rep A's — hidden
  });

  it('admin (view_all) sees the whole tenant', async () => {
    const res = await request(app).get('/api/v1/sales/customers').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const names = res.body.data.items.map((c: { fullName: string }) => c.fullName);
    expect(names).toEqual(expect.arrayContaining(['Alice Nguyen', 'Bob Buyer', 'Pool Lead']));
  });
});
