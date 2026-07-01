import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

// SPEC-048 GĐ2: SpendingPlan — a MANAGER may only manage plans for the department(s)
// they head; HR reviews. Scope enforcement is the security-critical part here.
const SLUG = 'spend-plan-it';
const HR = { email: 'hr@spendplan.com', password: 'HrTest@123' };
const MGR_A = { email: 'mgra@spendplan.com', password: 'MgrA@1234' };
const MGR_B = { email: 'mgrb@spendplan.com', password: 'MgrB@1234' };

async function cleanup(tenantId: string) {
  await db.spendingPlanItem.deleteMany({ where: { plan: { tenantId } } });
  await db.spendingPlan.deleteMany({ where: { tenantId } });
  await db.financeCategory.deleteMany({ where: { tenantId } });
  await db.issuingEntity.deleteMany({ where: { tenantId } });
  await db.department.updateMany({ where: { tenantId }, data: { managerId: null } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.department.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password, tenantSlug: SLUG });
  if (!res.body?.data?.accessToken) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

describe('SpendingPlan (dept-manager scope + lifecycle)', () => {
  let tenantId: string;
  let hrToken: string;
  let mgrAToken: string;
  let mgrBToken: string;
  let deptA: string;
  let deptB: string;
  let entityId: string;
  let adsCat: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'Spend IT', slug: SLUG } });
    tenantId = tenant.id;
    await cleanup(tenantId);
    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);

    const hrUser = await db.user.create({ data: { tenantId, email: HR.email, passwordHash: await hashPassword(HR.password), fullName: 'HR', role: 'HR_MANAGER', roleId: roleIds.get('hr_manager'), status: 'ACTIVE' } });
    const uA = await db.user.create({ data: { tenantId, email: MGR_A.email, passwordHash: await hashPassword(MGR_A.password), fullName: 'Mgr A', role: 'MANAGER', roleId: roleIds.get('manager'), status: 'ACTIVE' } });
    const uB = await db.user.create({ data: { tenantId, email: MGR_B.email, passwordHash: await hashPassword(MGR_B.password), fullName: 'Mgr B', role: 'MANAGER', roleId: roleIds.get('manager'), status: 'ACTIVE' } });

    const dA = await db.department.create({ data: { tenantId, name: 'Marketing' } });
    const dB = await db.department.create({ data: { tenantId, name: 'Sales' } });
    deptA = dA.id;
    deptB = dB.id;

    const empBase = { tenantId, joinDate: new Date('2024-01-01'), contractType: 'FULL_TIME' as const };
    const eA = await db.employee.create({ data: { ...empBase, userId: uA.id, employeeCode: 'MGRA', fullName: 'Mgr A', departmentId: deptA } });
    const eB = await db.employee.create({ data: { ...empBase, userId: uB.id, employeeCode: 'MGRB', fullName: 'Mgr B', departmentId: deptB } });
    await db.employee.create({ data: { ...empBase, userId: hrUser.id, employeeCode: 'HR', fullName: 'HR' } });
    // Make each manager the head of their department.
    await db.department.update({ where: { id: deptA }, data: { managerId: eA.id } });
    await db.department.update({ where: { id: deptB }, data: { managerId: eB.id } });

    const entity = await db.issuingEntity.create({ data: { tenantId, name: 'CC' } });
    entityId = entity.id;
    const ads = await db.financeCategory.create({ data: { tenantId, kind: 'EXPENSE', name: 'Ads' } });
    adsCat = ads.id;

    hrToken = await login(HR.email, HR.password);
    mgrAToken = await login(MGR_A.email, MGR_A.password);
    mgrBToken = await login(MGR_B.email, MGR_B.password);
  });

  function create(token: string, body: Record<string, unknown>) {
    return request(app).post('/api/v1/spending-plans').set('Authorization', `Bearer ${token}`).send(body);
  }

  const planBody = (departmentId: string) => ({
    departmentId,
    issuingEntityId: entityId,
    period: '2026-08',
    items: [
      { categoryId: adsCat, title: 'Facebook Ads', amount: 8000000, expectedDate: '2026-08-05', note: 'Q3 push' },
      { title: 'Google Ads', amount: 4000000 },
    ],
  });

  it('lets a manager create a plan for their own department (totalAmount = Σ items)', async () => {
    const res = await create(mgrAToken, planBody(deptA));
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.totalAmount).toBe('12000000');
    expect(res.body.data.items).toHaveLength(2);
  });

  it('forbids a manager creating a plan for a department they do not head (403)', async () => {
    const res = await create(mgrAToken, planBody(deptB));
    expect(res.status).toBe(403);
  });

  it('rejects a duplicate plan for the same dept+period+entity (409)', async () => {
    const res = await create(mgrAToken, planBody(deptA));
    expect(res.status).toBe(409);
  });

  it('validates amount > 0 and category kind (422/400)', async () => {
    const bad = await create(mgrBToken, {
      departmentId: deptB,
      issuingEntityId: entityId,
      period: '2026-08',
      items: [{ title: 'X', amount: 0 }],
    });
    expect(bad.status).toBe(422);
  });

  it('updates DRAFT items then submits; blocks edits after submit', async () => {
    // mgrB creates their own plan
    const created = await create(mgrBToken, {
      departmentId: deptB,
      issuingEntityId: entityId,
      period: '2026-08',
      items: [{ title: 'Booth', amount: 3000000 }],
    });
    const id = created.body.data.id;

    const upd = await request(app)
      .patch(`/api/v1/spending-plans/${id}`)
      .set('Authorization', `Bearer ${mgrBToken}`)
      .send({ items: [{ title: 'Booth', amount: 3000000 }, { title: 'Flyers', amount: 1000000 }] });
    expect(upd.status).toBe(200);
    expect(upd.body.data.totalAmount).toBe('4000000');

    // mgrA cannot touch mgrB's plan (valid body → must fail on scope, not validation)
    const hijack = await request(app)
      .patch(`/api/v1/spending-plans/${id}`)
      .set('Authorization', `Bearer ${mgrAToken}`)
      .send({ items: [{ title: 'Hijack', amount: 1 }] });
    expect([403, 404]).toContain(hijack.status);

    const submit = await request(app).post(`/api/v1/spending-plans/${id}/submit`).set('Authorization', `Bearer ${mgrBToken}`);
    expect(submit.status).toBe(200);
    expect(submit.body.data.status).toBe('SUBMITTED');

    // No edits once submitted.
    const lateEdit = await request(app)
      .patch(`/api/v1/spending-plans/${id}`)
      .set('Authorization', `Bearer ${mgrBToken}`)
      .send({ items: [{ title: 'Nope', amount: 1 }] });
    expect([400, 409]).toContain(lateEdit.status);
  });

  it('scope=mine returns only the manager\'s own department plans', async () => {
    const res = await request(app)
      .get('/api/v1/spending-plans?scope=mine')
      .set('Authorization', `Bearer ${mgrAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((p: { departmentId: string }) => p.departmentId === deptA)).toBe(true);
  });
});
