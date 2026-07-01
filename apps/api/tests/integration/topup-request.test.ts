import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

// SPEC-048 GĐ3: TopUpRequest — HR/Finance raises, Founder (SUPER_ADMIN) approves.
// Approving with a funded account posts an ACTUAL IN "Nạp quỹ" transaction and
// recomputes the account balance atomically.
const SLUG = 'topup-it';
const HR = { email: 'hr@topup.com', password: 'HrTest@123' };
const FOUNDER = { email: 'founder@topup.com', password: 'Founder@123' };

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password, tenantSlug: SLUG });
  if (!res.body?.data?.accessToken) throw new Error(`login ${email} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

describe('TopUpRequest (HR raises, Founder approves → funds account)', () => {
  let tenantId: string;
  let hrToken: string;
  let founderToken: string;
  let entityId: string;
  let accountId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'TopUp IT', slug: SLUG } });
    tenantId = tenant.id;
    await db.cashTransaction.deleteMany({ where: { tenantId } });
    await db.topUpRequest.deleteMany({ where: { tenantId } });
    await db.fundAccount.deleteMany({ where: { tenantId } });
    await db.financeCategory.deleteMany({ where: { tenantId } });
    await db.issuingEntity.deleteMany({ where: { tenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.role.deleteMany({ where: { tenantId, isSystem: false } });

    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);
    await db.user.create({ data: { tenantId, email: HR.email, passwordHash: await hashPassword(HR.password), fullName: 'HR Finance', role: 'HR_MANAGER', roleId: roleIds.get('hr_manager'), status: 'ACTIVE' } });
    await db.user.create({ data: { tenantId, email: FOUNDER.email, passwordHash: await hashPassword(FOUNDER.password), fullName: 'Founder', role: 'SUPER_ADMIN', roleId: roleIds.get('super_admin'), status: 'ACTIVE' } });

    const entity = await db.issuingEntity.create({ data: { tenantId, name: 'CC' } });
    entityId = entity.id;
    const acc = await db.fundAccount.create({ data: { tenantId, issuingEntityId: entity.id, name: 'Main', type: 'BANK', openingBalance: 5000000, currentBalance: 5000000 } });
    accountId = acc.id;
    await db.financeCategory.create({ data: { tenantId, kind: 'INCOME', name: 'Nạp quỹ / Góp vốn' } });

    hrToken = await login(HR.email, HR.password);
    founderToken = await login(FOUNDER.email, FOUNDER.password);
  });

  function createReq(token: string, body: Record<string, unknown>) {
    return request(app).post('/api/v1/topup-requests').set('Authorization', `Bearer ${token}`).send(body);
  }

  it('lets HR create a request; Founder (not HR) approves', async () => {
    const created = await createReq(hrToken, { issuingEntityId: entityId, title: 'Nạp quỹ tháng 8', amount: 100000000, neededByDate: '2026-08-20', justification: 'Thiếu hụt dự báo 100tr' });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('PENDING');
    expect(created.body.data.createdByName).toBe('HR Finance');
    const id = created.body.data.id;

    // HR cannot approve.
    const hrApprove = await request(app).post(`/api/v1/topup-requests/${id}/review`).set('Authorization', `Bearer ${hrToken}`).send({ decision: 'APPROVED' });
    expect(hrApprove.status).toBe(403);

    // Founder approves WITH a funded account → posts an IN transaction + recomputes balance.
    const approve = await request(app).post(`/api/v1/topup-requests/${id}/review`).set('Authorization', `Bearer ${founderToken}`).send({ decision: 'APPROVED', fundedAccountId: accountId });
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('APPROVED');
    expect(approve.body.data.fundedAccountId).toBe(accountId);

    // Balance: 5,000,000 + 100,000,000 = 105,000,000
    const acc = await db.fundAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(acc.currentBalance.toString()).toBe('105000000');
    // The generated transaction is tagged as a "Nạp quỹ" IN from the topup source.
    const tx = await db.cashTransaction.findFirst({ where: { tenantId, direction: 'IN', amount: 100000000 } });
    expect(tx).not.toBeNull();
    expect(tx?.status).toBe('ACTUAL');
  });

  it('reject requires a note; cancel works on PENDING', async () => {
    const r = await createReq(hrToken, { issuingEntityId: entityId, title: 'R', amount: 1000000, justification: 'x' });
    const id = r.body.data.id;
    const noNote = await request(app).post(`/api/v1/topup-requests/${id}/review`).set('Authorization', `Bearer ${founderToken}`).send({ decision: 'REJECTED' });
    expect(noNote.status).toBe(400);
    const rejected = await request(app).post(`/api/v1/topup-requests/${id}/review`).set('Authorization', `Bearer ${founderToken}`).send({ decision: 'REJECTED', note: 'Chưa cần' });
    expect(rejected.body.data.status).toBe('REJECTED');

    const c = await createReq(hrToken, { issuingEntityId: entityId, title: 'C', amount: 2000000, justification: 'y' });
    const cancel = await request(app).post(`/api/v1/topup-requests/${c.body.data.id}/cancel`).set('Authorization', `Bearer ${hrToken}`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe('CANCELLED');
  });

  it('generates a justification draft from approved plans + forecast shortfall', async () => {
    const res = await request(app)
      .get(`/api/v1/topup-requests/justification-draft?issuingEntityId=${entityId}&month=2026-08`)
      .set('Authorization', `Bearer ${hrToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.period).toBe('2026-08');
    expect(typeof res.body.data.text).toBe('string');
    expect(res.body.data.text.length).toBeGreaterThan(0);
  });
});
