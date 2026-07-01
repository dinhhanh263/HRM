import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

// SPEC-048: FinanceCategory CRUD + default seeding on first read.
//   GET/POST/PATCH/DELETE /finance-categories → finance:view + cash_transaction:create
// Invariants: first GET seeds the default VN category tree; EMPLOYEE is 403;
// a category in use cannot be hard-deleted (deactivated instead).
const SLUG = 'fin-cat-it-tenant';
const HR = { email: 'hr@fincat.com', password: 'HrTest@123' };
const EMP = { email: 'emp@fincat.com', password: 'EmpTest@123' };

async function cleanup(tenantId: string) {
  await db.cashTransaction.deleteMany({ where: { tenantId } });
  await db.fundAccount.deleteMany({ where: { tenantId } });
  await db.financeCategory.deleteMany({ where: { tenantId } });
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

describe('FinanceCategory routes (RBAC + default seed + in-use guard)', () => {
  let tenantId: string;
  let hrToken: string;
  let empToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'FinCat IT', slug: SLUG } });
    tenantId = tenant.id;
    await cleanup(tenantId);
    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);
    await db.user.create({
      data: { tenantId, email: HR.email, passwordHash: await hashPassword(HR.password), fullName: 'HR', role: 'HR_MANAGER', roleId: roleIds.get('hr_manager'), status: 'ACTIVE' },
    });
    await db.user.create({
      data: { tenantId, email: EMP.email, passwordHash: await hashPassword(EMP.password), fullName: 'Emp', role: 'EMPLOYEE', roleId: roleIds.get('employee'), status: 'ACTIVE' },
    });
    hrToken = await login(HR.email, HR.password, SLUG);
    empToken = await login(EMP.email, EMP.password, SLUG);
  });

  it('seeds default categories on first list (both INCOME and EXPENSE)', async () => {
    const res = await request(app).get('/api/v1/finance-categories').set('Authorization', `Bearer ${hrToken}`);
    expect(res.status).toBe(200);
    const kinds = new Set(res.body.data.map((c: { kind: string }) => c.kind));
    expect(kinds.has('INCOME')).toBe(true);
    expect(kinds.has('EXPENSE')).toBe(true);
    expect(res.body.data.some((c: { name: string }) => c.name.toLowerCase().includes('ads'))).toBe(true);

    // Idempotent: a second list does not duplicate the seed.
    const again = await request(app).get('/api/v1/finance-categories').set('Authorization', `Bearer ${hrToken}`);
    expect(again.body.data.length).toBe(res.body.data.length);
  });

  it('filters by kind', async () => {
    const income = await request(app)
      .get('/api/v1/finance-categories?kind=INCOME')
      .set('Authorization', `Bearer ${hrToken}`);
    expect(income.body.data.every((c: { kind: string }) => c.kind === 'INCOME')).toBe(true);
  });

  it('creates a category and rejects blank name (422)', async () => {
    const created = await request(app)
      .post('/api/v1/finance-categories')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ kind: 'EXPENSE', name: 'Thuê xưởng' });
    expect(created.status).toBe(201);
    expect(created.body.data.name).toBe('Thuê xưởng');

    const blank = await request(app)
      .post('/api/v1/finance-categories')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ kind: 'EXPENSE', name: '  ' });
    expect(blank.status).toBe(422);
  });

  it('EMPLOYEE cannot read or write (403)', async () => {
    const list = await request(app).get('/api/v1/finance-categories').set('Authorization', `Bearer ${empToken}`);
    expect(list.status).toBe(403);
    const create = await request(app)
      .post('/api/v1/finance-categories')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ kind: 'EXPENSE', name: 'X' });
    expect(create.status).toBe(403);
  });

  it('blocks hard-delete of a category in use (409)', async () => {
    const cat = await request(app)
      .post('/api/v1/finance-categories')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ kind: 'EXPENSE', name: 'Đang dùng' });
    const catId = cat.body.data.id;

    const entity = await db.issuingEntity.create({ data: { tenantId, name: 'E' } });
    const account = await db.fundAccount.create({
      data: { tenantId, issuingEntityId: entity.id, name: 'A', type: 'CASH' },
    });
    await db.cashTransaction.create({
      data: {
        tenantId, accountId: account.id, issuingEntityId: entity.id, direction: 'OUT',
        amount: 50, occurredAt: new Date(), categoryId: catId, createdById: 'seed',
      },
    });

    const del = await request(app)
      .delete(`/api/v1/finance-categories/${catId}`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(del.status).toBe(409);

    // An unused category deletes cleanly.
    const unused = await request(app)
      .post('/api/v1/finance-categories')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ kind: 'EXPENSE', name: 'Không dùng' });
    const delOk = await request(app)
      .delete(`/api/v1/finance-categories/${unused.body.data.id}`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(delOk.status).toBe(204);
  });
});
