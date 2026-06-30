import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';
import { seedDefaultSalesRolesForTenant } from '../../src/domain/sales/defaults.js';

// SPEC-045 Task 1.3 — Customer lifecycle change + LIFECYCLE_CHANGED activity.
const SLUG = 'sales-lifecycle-tenant';
const ADMIN = { email: 'admin@saleslc.com', password: 'Admin@123' };

async function cleanup(tenantId: string) {
  await db.salesActivity.deleteMany({ where: { tenantId } });
  await db.customer.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password, tenantSlug: SLUG });
  if (!res.body?.data?.accessToken) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

describe('Sales lifecycle (change status + lostReason + LIFECYCLE_CHANGED)', () => {
  let tenantId: string;
  let token: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'Sales LC', slug: SLUG } });
    tenantId = tenant.id;
    await cleanup(tenantId);
    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);
    await seedDefaultSalesRolesForTenant(db, tenantId);
    await db.user.create({
      data: { tenantId, email: ADMIN.email, passwordHash: await hashPassword(ADMIN.password), fullName: 'Admin', role: 'SUPER_ADMIN', roleId: roleIds.get('super_admin'), status: 'ACTIVE' },
    });
    token = await login(ADMIN.email, ADMIN.password);
  });

  async function createLead(name: string): Promise<string> {
    const res = await request(app).post('/api/v1/sales/customers').set('Authorization', `Bearer ${token}`).send({ type: 'B2C', fullName: name });
    return res.body.data.id;
  }

  it('advances NEW → CONTACTED and records a LIFECYCLE_CHANGED activity', async () => {
    const id = await createLead('Advance Me');
    const res = await request(app)
      .post(`/api/v1/sales/customers/${id}/lifecycle`)
      .set('Authorization', `Bearer ${token}`)
      .send({ lifecycleStatus: 'CONTACTED' });
    expect(res.status).toBe(200);
    expect(res.body.data.lifecycleStatus).toBe('CONTACTED');

    const acts = await db.salesActivity.findMany({ where: { customerId: id, type: 'LIFECYCLE_CHANGED' } });
    expect(acts).toHaveLength(1);
    expect(acts[0].body).toBe('NEW → CONTACTED');
  });

  it('rejects DISQUALIFIED without a lostReason (422)', async () => {
    const id = await createLead('No Reason');
    const res = await request(app)
      .post(`/api/v1/sales/customers/${id}/lifecycle`)
      .set('Authorization', `Bearer ${token}`)
      .send({ lifecycleStatus: 'DISQUALIFIED' });
    expect(res.status).toBe(422);
  });

  it('disqualifies with a lostReason and persists it', async () => {
    const id = await createLead('Disqualify Me');
    const res = await request(app)
      .post(`/api/v1/sales/customers/${id}/lifecycle`)
      .set('Authorization', `Bearer ${token}`)
      .send({ lifecycleStatus: 'DISQUALIFIED', lostReason: 'Ngân sách không đủ' });
    expect(res.status).toBe(200);
    expect(res.body.data.lifecycleStatus).toBe('DISQUALIFIED');
    expect(res.body.data.lostReason).toBe('Ngân sách không đủ');
  });

  it('clears lostReason when moving away from DISQUALIFIED', async () => {
    const id = await createLead('Reactivate Me');
    await request(app).post(`/api/v1/sales/customers/${id}/lifecycle`).set('Authorization', `Bearer ${token}`).send({ lifecycleStatus: 'DISQUALIFIED', lostReason: 'Tạm dừng' });
    const res = await request(app).post(`/api/v1/sales/customers/${id}/lifecycle`).set('Authorization', `Bearer ${token}`).send({ lifecycleStatus: 'QUALIFIED' });
    expect(res.status).toBe(200);
    expect(res.body.data.lifecycleStatus).toBe('QUALIFIED');
    expect(res.body.data.lostReason).toBeNull();
  });
});
