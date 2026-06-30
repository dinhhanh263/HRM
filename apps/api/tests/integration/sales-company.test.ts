import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

// SPEC-045 Task 1.4 — SalesCompany (B2B) CRUD + linking a B2B customer to a company.
const SLUG = 'sales-company-tenant';
const OTHER_SLUG = 'sales-company-other';
const ADMIN = { email: 'admin@salesco.com', password: 'Admin@123' };
const OTHER = { email: 'admin@salesco-other.com', password: 'Admin@123' };

async function cleanup(tenantId: string) {
  await db.customer.deleteMany({ where: { tenantId } });
  await db.salesCompany.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

async function login(email: string, password: string, slug: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password, tenantSlug: slug });
  if (!res.body?.data?.accessToken) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

describe('Sales companies (B2B CRUD + customer link + tenant scope)', () => {
  let tenantId: string;
  let otherTenantId: string;
  let token: string;
  let otherToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'Sales Co', slug: SLUG } });
    tenantId = tenant.id;
    const other = await db.tenant.upsert({ where: { slug: OTHER_SLUG }, update: {}, create: { name: 'Sales Co Other', slug: OTHER_SLUG } });
    otherTenantId = other.id;
    await cleanup(tenantId);
    await cleanup(otherTenantId);
    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);
    const otherRoles = await syncSystemRolesForTenant(db, otherTenantId);
    await db.user.create({ data: { tenantId, email: ADMIN.email, passwordHash: await hashPassword(ADMIN.password), fullName: 'Admin', role: 'SUPER_ADMIN', roleId: roleIds.get('super_admin'), status: 'ACTIVE' } });
    await db.user.create({ data: { tenantId: otherTenantId, email: OTHER.email, passwordHash: await hashPassword(OTHER.password), fullName: 'Other', role: 'SUPER_ADMIN', roleId: otherRoles.get('super_admin'), status: 'ACTIVE' } });
    token = await login(ADMIN.email, ADMIN.password, SLUG);
    otherToken = await login(OTHER.email, OTHER.password, OTHER_SLUG);
  });

  it('creates a company and links a B2B customer to it (customerCount reflects)', async () => {
    const co = await request(app).post('/api/v1/sales/companies').set('Authorization', `Bearer ${token}`).send({ name: 'FPT Corp', taxCode: '0101248141', industry: 'IT' });
    expect(co.status).toBe(201);
    const companyId = co.body.data.id;

    const cust = await request(app).post('/api/v1/sales/customers').set('Authorization', `Bearer ${token}`).send({ type: 'B2B', fullName: 'Anh Tuấn', companyId });
    expect(cust.status).toBe(201);
    expect(cust.body.data.companyId).toBe(companyId);
    expect(cust.body.data.company?.name).toBe('FPT Corp');

    const got = await request(app).get(`/api/v1/sales/companies/${companyId}`).set('Authorization', `Bearer ${token}`);
    expect(got.body.data.customerCount).toBe(1);
  });

  it('rejects linking a customer to a company from another tenant (400)', async () => {
    const co = await request(app).post('/api/v1/sales/companies').set('Authorization', `Bearer ${otherToken}`).send({ name: 'Other Co' });
    const otherCompanyId = co.body.data.id;
    const res = await request(app).post('/api/v1/sales/customers').set('Authorization', `Bearer ${token}`).send({ type: 'B2B', fullName: 'Cross Tenant', companyId: otherCompanyId });
    expect(res.status).toBe(400);
  });

  it('does not leak companies across tenants in the list', async () => {
    const res = await request(app).get('/api/v1/sales/companies').set('Authorization', `Bearer ${otherToken}`);
    const names = res.body.data.items.map((c: { name: string }) => c.name);
    expect(names).toContain('Other Co');
    expect(names).not.toContain('FPT Corp');
  });
});
