import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

// SPEC-048: FundAccount CRUD — tenant-scoped, permission-driven, multi-entity.
//   GET/POST/PATCH/DELETE /fund-accounts → fund_account:*  (HR_MANAGER)
// Invariants under test: currentBalance starts = openingBalance; EMPLOYEE (no
// finance perms) is 403; entities from another tenant are invisible (404/400);
// list filters by issuingEntityId.
const SLUG = 'fund-acc-it-tenant';
const OTHER_SLUG = 'fund-acc-it-other';
const HR = { email: 'hr@fundacc.com', password: 'HrTest@123' };
const EMP = { email: 'emp@fundacc.com', password: 'EmpTest@123' };

async function cleanup(tenantId: string) {
  await db.cashTransaction.deleteMany({ where: { tenantId } });
  await db.fundAccount.deleteMany({ where: { tenantId } });
  await db.issuingEntity.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

async function login(email: string, password: string, slug: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password, tenantSlug: slug });
  if (!res.body?.data?.accessToken) throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

describe('FundAccount routes (RBAC + tenant scope + multi-entity)', () => {
  let tenantId: string;
  let otherTenantId: string;
  let hrToken: string;
  let empToken: string;
  let entityCodecrush: string;
  let entityHale: string;
  let otherEntity: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'Fund IT', slug: SLUG } });
    tenantId = tenant.id;
    const other = await db.tenant.upsert({ where: { slug: OTHER_SLUG }, update: {}, create: { name: 'Fund Other', slug: OTHER_SLUG } });
    otherTenantId = other.id;
    await cleanup(tenantId);
    await cleanup(otherTenantId);

    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);
    await syncSystemRolesForTenant(db, otherTenantId);

    await db.user.create({
      data: { tenantId, email: HR.email, passwordHash: await hashPassword(HR.password), fullName: 'HR', role: 'HR_MANAGER', roleId: roleIds.get('hr_manager'), status: 'ACTIVE' },
    });
    await db.user.create({
      data: { tenantId, email: EMP.email, passwordHash: await hashPassword(EMP.password), fullName: 'Emp', role: 'EMPLOYEE', roleId: roleIds.get('employee'), status: 'ACTIVE' },
    });

    const ec = await db.issuingEntity.create({ data: { tenantId, name: 'Codecrush' } });
    const eh = await db.issuingEntity.create({ data: { tenantId, name: 'Ha Le' } });
    const eo = await db.issuingEntity.create({ data: { tenantId: otherTenantId, name: 'Other Co' } });
    entityCodecrush = ec.id;
    entityHale = eh.id;
    otherEntity = eo.id;

    hrToken = await login(HR.email, HR.password, SLUG);
    empToken = await login(EMP.email, EMP.password, SLUG);
  });

  it('creates a fund account with currentBalance = openingBalance', async () => {
    const res = await request(app)
      .post('/api/v1/fund-accounts')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ issuingEntityId: entityCodecrush, name: 'Vietcombank CC', type: 'BANK', openingBalance: 5000000 });
    expect(res.status).toBe(201);
    expect(res.body.data.currentBalance).toBe('5000000');
    expect(res.body.data.openingBalance).toBe('5000000');
    expect(res.body.data.issuingEntityName).toBe('Codecrush');
    expect(res.body.data.currency).toBe('VND');
  });

  it('rejects blank name (422) and unknown issuing entity (400/404)', async () => {
    const blank = await request(app)
      .post('/api/v1/fund-accounts')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ issuingEntityId: entityCodecrush, name: '   ', type: 'CASH' });
    expect(blank.status).toBe(422);

    const badEntity = await request(app)
      .post('/api/v1/fund-accounts')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ issuingEntityId: otherEntity, name: 'Hijack', type: 'BANK' });
    expect([400, 404]).toContain(badEntity.status);
  });

  it('EMPLOYEE without finance perms is forbidden (403)', async () => {
    const list = await request(app).get('/api/v1/fund-accounts').set('Authorization', `Bearer ${empToken}`);
    expect(list.status).toBe(403);
    const create = await request(app)
      .post('/api/v1/fund-accounts')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ issuingEntityId: entityCodecrush, name: 'Nope', type: 'CASH' });
    expect(create.status).toBe(403);
  });

  it('lists and filters by issuingEntityId', async () => {
    await request(app)
      .post('/api/v1/fund-accounts')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ issuingEntityId: entityHale, name: 'Cash Ha Le', type: 'CASH', openingBalance: 200000 });

    const all = await request(app).get('/api/v1/fund-accounts').set('Authorization', `Bearer ${hrToken}`);
    expect(all.status).toBe(200);
    expect(all.body.data.length).toBeGreaterThanOrEqual(2);

    const hale = await request(app)
      .get(`/api/v1/fund-accounts?issuingEntityId=${entityHale}`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(hale.body.data.every((a: { issuingEntityId: string }) => a.issuingEntityId === entityHale)).toBe(true);
  });

  it('updates and hard-deletes an account with no transactions', async () => {
    const created = await request(app)
      .post('/api/v1/fund-accounts')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ issuingEntityId: entityCodecrush, name: 'Temp Acc', type: 'EWALLET' });
    const id = created.body.data.id;

    const patch = await request(app)
      .patch(`/api/v1/fund-accounts/${id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ name: 'Renamed Acc' });
    expect(patch.status).toBe(200);
    expect(patch.body.data.name).toBe('Renamed Acc');

    const del = await request(app).delete(`/api/v1/fund-accounts/${id}`).set('Authorization', `Bearer ${hrToken}`);
    expect(del.status).toBe(204);
    expect(await db.fundAccount.findUnique({ where: { id } })).toBeNull();
  });

  it('deactivates instead of deleting when the account has transactions (409)', async () => {
    const created = await request(app)
      .post('/api/v1/fund-accounts')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ issuingEntityId: entityCodecrush, name: 'Used Acc', type: 'BANK', openingBalance: 100 });
    const id = created.body.data.id;
    await db.cashTransaction.create({
      data: {
        tenantId, accountId: id, issuingEntityId: entityCodecrush, direction: 'IN',
        amount: 100, occurredAt: new Date(), createdById: 'seed',
      },
    });

    const del = await request(app).delete(`/api/v1/fund-accounts/${id}`).set('Authorization', `Bearer ${hrToken}`);
    expect(del.status).toBe(409);
    expect(await db.fundAccount.findUnique({ where: { id } })).not.toBeNull();
  });
});
