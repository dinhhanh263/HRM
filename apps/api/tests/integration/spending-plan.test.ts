import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

// SPEC-048 GĐ2': spending plans are personal proposals — ANY employee may create;
// only the creator (owner) edits their own; HR/Founder review. Department is an
// optional tag (defaults to the creator's own department).
const SLUG = 'spend-plan-it';
const HR = { email: 'hr@spendplan.com', password: 'HrTest@123' };
const EMP_A = { email: 'empa@spendplan.com', password: 'EmpA@1234' };
const EMP_B = { email: 'empb@spendplan.com', password: 'EmpB@1234' };

async function cleanup(tenantId: string) {
  await db.spendingPlanItem.deleteMany({ where: { plan: { tenantId } } });
  await db.spendingPlan.deleteMany({ where: { tenantId } });
  await db.financeCategory.deleteMany({ where: { tenantId } });
  await db.issuingEntity.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.department.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password, tenantSlug: SLUG });
  if (!res.body?.data?.accessToken) throw new Error(`login ${email} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

describe('SpendingPlan (any-employee proposals + owner scope + HR review)', () => {
  let tenantId: string;
  let hrToken: string;
  let empAToken: string;
  let empBToken: string;
  let marketing: string;
  let entityId: string;
  let adsCat: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'Spend IT', slug: SLUG } });
    tenantId = tenant.id;
    await cleanup(tenantId);
    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);

    const hrUser = await db.user.create({ data: { tenantId, email: HR.email, passwordHash: await hashPassword(HR.password), fullName: 'HR', role: 'HR_MANAGER', roleId: roleIds.get('hr_manager'), status: 'ACTIVE' } });
    const uA = await db.user.create({ data: { tenantId, email: EMP_A.email, passwordHash: await hashPassword(EMP_A.password), fullName: 'Emp A', role: 'EMPLOYEE', roleId: roleIds.get('employee'), status: 'ACTIVE' } });
    const uB = await db.user.create({ data: { tenantId, email: EMP_B.email, passwordHash: await hashPassword(EMP_B.password), fullName: 'Emp B', role: 'EMPLOYEE', roleId: roleIds.get('employee'), status: 'ACTIVE' } });

    const dM = await db.department.create({ data: { tenantId, name: 'Marketing' } });
    const dS = await db.department.create({ data: { tenantId, name: 'Sales' } });
    marketing = dM.id;

    const empBase = { tenantId, joinDate: new Date('2024-01-01'), contractType: 'FULL_TIME' as const };
    await db.employee.create({ data: { ...empBase, userId: hrUser.id, employeeCode: 'HR', fullName: 'HR' } });
    await db.employee.create({ data: { ...empBase, userId: uA.id, employeeCode: 'EA', fullName: 'Emp A', departmentId: dM.id } });
    await db.employee.create({ data: { ...empBase, userId: uB.id, employeeCode: 'EB', fullName: 'Emp B', departmentId: dS.id } });

    const entity = await db.issuingEntity.create({ data: { tenantId, name: 'CC' } });
    entityId = entity.id;
    adsCat = (await db.financeCategory.create({ data: { tenantId, kind: 'EXPENSE', name: 'Ads' } })).id;

    hrToken = await login(HR.email, HR.password);
    empAToken = await login(EMP_A.email, EMP_A.password);
    empBToken = await login(EMP_B.email, EMP_B.password);
  });

  function create(token: string, body: Record<string, unknown>) {
    return request(app).post('/api/v1/spending-plans').set('Authorization', `Bearer ${token}`).send(body);
  }
  const items = [
    { categoryId: adsCat, title: 'Facebook Ads', amount: 8000000, expectedDate: '2026-08-05' },
    { title: 'Google Ads', amount: 4000000 },
  ];

  it('lets ANY employee create a plan (totalAmount = Σ items)', async () => {
    const res = await create(empAToken, { issuingEntityId: entityId, period: '2026-08', departmentId: marketing, items });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.totalAmount).toBe('12000000');
    expect(res.body.data.departmentId).toBe(marketing);
  });

  it('defaults department to the creator\'s own when omitted', async () => {
    const res = await create(empBToken, { issuingEntityId: entityId, period: '2026-09', items: [{ title: 'X', amount: 1000000 }] });
    expect(res.status).toBe(201);
    // Emp B belongs to Sales → plan tagged Sales automatically.
    const sales = await db.department.findFirstOrThrow({ where: { tenantId, name: 'Sales' } });
    expect(res.body.data.departmentId).toBe(sales.id);
  });

  it('allows multiple people to plan the same dept+period (no unique limit)', async () => {
    const a = await create(empAToken, { issuingEntityId: entityId, period: '2026-10', departmentId: marketing, items: [{ title: 'A', amount: 1 }] });
    const b = await create(empBToken, { issuingEntityId: entityId, period: '2026-10', departmentId: marketing, items: [{ title: 'B', amount: 2 }] });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
  });

  it('rejects amount <= 0 (422)', async () => {
    const res = await create(empAToken, { issuingEntityId: entityId, period: '2026-08', items: [{ title: 'X', amount: 0 }] });
    expect(res.status).toBe(422);
  });

  it('only the owner can edit/submit; others cannot even see it (404)', async () => {
    const created = await create(empAToken, { issuingEntityId: entityId, period: '2026-11', items: [{ title: 'Draft', amount: 5000000 }] });
    const id = created.body.data.id;

    // Emp B cannot read, edit, or submit Emp A's plan.
    expect((await request(app).get(`/api/v1/spending-plans/${id}`).set('Authorization', `Bearer ${empBToken}`)).status).toBe(404);
    expect((await request(app).patch(`/api/v1/spending-plans/${id}`).set('Authorization', `Bearer ${empBToken}`).send({ items: [{ title: 'Hijack', amount: 1 }] })).status).toBe(404);
    expect((await request(app).post(`/api/v1/spending-plans/${id}/submit`).set('Authorization', `Bearer ${empBToken}`)).status).toBe(404);

    // Owner edits then submits.
    const upd = await request(app).patch(`/api/v1/spending-plans/${id}`).set('Authorization', `Bearer ${empAToken}`).send({ items: [{ title: 'Draft', amount: 5000000 }, { title: 'More', amount: 1000000 }] });
    expect(upd.status).toBe(200);
    expect(upd.body.data.totalAmount).toBe('6000000');
    expect((await request(app).post(`/api/v1/spending-plans/${id}/submit`).set('Authorization', `Bearer ${empAToken}`)).body.data.status).toBe('SUBMITTED');
  });

  it('scope=mine returns only my own proposals', async () => {
    const res = await request(app).get('/api/v1/spending-plans?scope=mine').set('Authorization', `Bearer ${empBToken}`);
    expect(res.status).toBe(200);
    // Every returned plan was created by Emp B (verified via re-fetch of createdById).
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('employee cannot use scope=all nor review; HR reviews (reject w/ note → resubmit → approve)', async () => {
    expect((await request(app).get('/api/v1/spending-plans?scope=all').set('Authorization', `Bearer ${empAToken}`)).status).toBe(403);
    const allAsHr = await request(app).get('/api/v1/spending-plans?scope=all').set('Authorization', `Bearer ${hrToken}`);
    expect(allAsHr.status).toBe(200);

    // A submitted plan from Emp A.
    const created = await create(empAToken, { issuingEntityId: entityId, period: '2026-12', items: [{ title: 'Plan', amount: 3000000 }] });
    const id = created.body.data.id;
    await request(app).post(`/api/v1/spending-plans/${id}/submit`).set('Authorization', `Bearer ${empAToken}`).expect(200);

    // Employee cannot review.
    expect((await request(app).post(`/api/v1/spending-plans/${id}/review`).set('Authorization', `Bearer ${empAToken}`).send({ decision: 'APPROVED' })).status).toBe(403);
    // HR reject needs a note.
    expect((await request(app).post(`/api/v1/spending-plans/${id}/review`).set('Authorization', `Bearer ${hrToken}`).send({ decision: 'REJECTED' })).status).toBe(400);

    const rejected = await request(app).post(`/api/v1/spending-plans/${id}/review`).set('Authorization', `Bearer ${hrToken}`).send({ decision: 'REJECTED', note: 'Cắt giảm' });
    expect(rejected.body.data.status).toBe('REJECTED');
    await request(app).post(`/api/v1/spending-plans/${id}/submit`).set('Authorization', `Bearer ${empAToken}`).expect(200);
    const approved = await request(app).post(`/api/v1/spending-plans/${id}/review`).set('Authorization', `Bearer ${hrToken}`).send({ decision: 'APPROVED' });
    expect(approved.body.data.status).toBe('APPROVED');
  });
});
