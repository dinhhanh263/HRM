import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

// SPEC-048: CashTransaction ledger + ATOMIC balance recompute (risk-first).
//   currentBalance = openingBalance + Σ(ACTUAL IN) − Σ(ACTUAL OUT), always derived.
//   PLANNED rows never touch the balance. Moving a tx between accounts recomputes both.
const SLUG = 'cash-tx-it-tenant';
const HR = { email: 'hr@cashtx.com', password: 'HrTest@123' };
const EMP = { email: 'emp@cashtx.com', password: 'EmpTest@123' };

async function cleanup(tenantId: string) {
  await db.cashTransaction.deleteMany({ where: { tenantId } });
  await db.fundAccount.deleteMany({ where: { tenantId } });
  await db.issuingEntity.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password, tenantSlug: SLUG });
  if (!res.body?.data?.accessToken) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

async function balance(id: string): Promise<string> {
  const a = await db.fundAccount.findUniqueOrThrow({ where: { id } });
  return a.currentBalance.toString();
}

describe('CashTransaction ledger + balance recompute', () => {
  let tenantId: string;
  let hrToken: string;
  let empToken: string;
  let entityId: string;
  let accountA: string;
  let accountB: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'Cash IT', slug: SLUG } });
    tenantId = tenant.id;
    await cleanup(tenantId);
    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);
    await db.user.create({ data: { tenantId, email: HR.email, passwordHash: await hashPassword(HR.password), fullName: 'HR', role: 'HR_MANAGER', roleId: roleIds.get('hr_manager'), status: 'ACTIVE' } });
    await db.user.create({ data: { tenantId, email: EMP.email, passwordHash: await hashPassword(EMP.password), fullName: 'Emp', role: 'EMPLOYEE', roleId: roleIds.get('employee'), status: 'ACTIVE' } });

    const entity = await db.issuingEntity.create({ data: { tenantId, name: 'CC' } });
    entityId = entity.id;
    const a = await db.fundAccount.create({ data: { tenantId, issuingEntityId: entityId, name: 'Acc A', type: 'BANK', openingBalance: 1000000, currentBalance: 1000000 } });
    const b = await db.fundAccount.create({ data: { tenantId, issuingEntityId: entityId, name: 'Acc B', type: 'CASH', openingBalance: 0, currentBalance: 0 } });
    accountA = a.id;
    accountB = b.id;

    hrToken = await login(HR.email, HR.password);
    empToken = await login(EMP.email, EMP.password);
  });

  async function create(body: Record<string, unknown>, token = hrToken) {
    return request(app).post('/api/v1/cash-transactions').set('Authorization', `Bearer ${token}`).send(body);
  }

  it('recomputes balance on IN / OUT create (ACTUAL)', async () => {
    const inTx = await create({ accountId: accountA, direction: 'IN', amount: 500000, occurredAt: '2026-07-01' });
    expect(inTx.status).toBe(201);
    expect(await balance(accountA)).toBe('1500000');

    await create({ accountId: accountA, direction: 'OUT', amount: 200000, occurredAt: '2026-07-02' });
    expect(await balance(accountA)).toBe('1300000');
  });

  it('PLANNED transactions do not affect the balance', async () => {
    const before = await balance(accountA);
    await create({ accountId: accountA, direction: 'IN', amount: 999999, occurredAt: '2026-07-10', status: 'PLANNED' });
    expect(await balance(accountA)).toBe(before);
  });

  it('recomputes on update (amount change) and on delete', async () => {
    const tx = await create({ accountId: accountA, direction: 'OUT', amount: 100000, occurredAt: '2026-07-03' });
    const id = tx.body.data.id;
    // Balance now 1,300,000 − 100,000 = 1,200,000
    expect(await balance(accountA)).toBe('1200000');

    await request(app).patch(`/api/v1/cash-transactions/${id}`).set('Authorization', `Bearer ${hrToken}`).send({ amount: 300000 });
    // 1,300,000 − 300,000 = 1,000,000
    expect(await balance(accountA)).toBe('1000000');

    await request(app).delete(`/api/v1/cash-transactions/${id}`).set('Authorization', `Bearer ${hrToken}`).expect(204);
    // back to 1,300,000
    expect(await balance(accountA)).toBe('1300000');
  });

  it('recomputes BOTH accounts when a transaction moves between accounts', async () => {
    const tx = await create({ accountId: accountA, direction: 'IN', amount: 400000, occurredAt: '2026-07-04' });
    const id = tx.body.data.id;
    const aWith = await balance(accountA); // 1,300,000 + 400,000 = 1,700,000
    expect(aWith).toBe('1700000');

    await request(app).patch(`/api/v1/cash-transactions/${id}`).set('Authorization', `Bearer ${hrToken}`).send({ accountId: accountB });
    expect(await balance(accountA)).toBe('1300000'); // A reverts
    expect(await balance(accountB)).toBe('400000'); // B gains
  });

  it('lists with totals (ACTUAL IN/OUT/net) and filters', async () => {
    const res = await request(app)
      .get(`/api/v1/cash-transactions?accountId=${accountA}`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(typeof res.body.data.totalIn).toBe('string');
    expect(typeof res.body.data.totalOut).toBe('string');
    // net = totalIn − totalOut
    expect(Number(res.body.data.net)).toBe(Number(res.body.data.totalIn) - Number(res.body.data.totalOut));

    // Direction filter
    const outs = await request(app)
      .get('/api/v1/cash-transactions?direction=OUT')
      .set('Authorization', `Bearer ${hrToken}`);
    expect(outs.body.data.items.every((t: { direction: string }) => t.direction === 'OUT')).toBe(true);
  });

  it('rejects amount <= 0 (422) and EMPLOYEE writes (403)', async () => {
    const bad = await create({ accountId: accountA, direction: 'IN', amount: 0, occurredAt: '2026-07-05' });
    expect(bad.status).toBe(422);

    const forbidden = await create({ accountId: accountA, direction: 'IN', amount: 100, occurredAt: '2026-07-05' }, empToken);
    expect(forbidden.status).toBe(403);

    const list = await request(app).get('/api/v1/cash-transactions').set('Authorization', `Bearer ${empToken}`);
    expect(list.status).toBe(403);
  });
});
