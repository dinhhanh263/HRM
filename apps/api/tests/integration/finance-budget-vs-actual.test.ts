import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

// SPEC-048 GĐ2: budget-vs-actual = APPROVED plan vs ACTUAL OUT for a period.
const SLUG = 'bva-it';
const HR = { email: 'hr@bva.com', password: 'HrTest@123' };
const EMP = { email: 'emp@bva.com', password: 'EmpTest@123' };

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password, tenantSlug: SLUG });
  return res.body.data.accessToken;
}

describe('Budget vs Actual', () => {
  let tenantId: string;
  let hrToken: string;
  let empToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'BVA IT', slug: SLUG } });
    tenantId = tenant.id;
    await db.spendingPlanItem.deleteMany({ where: { plan: { tenantId } } });
    await db.spendingPlan.deleteMany({ where: { tenantId } });
    await db.cashTransaction.deleteMany({ where: { tenantId } });
    await db.fundAccount.deleteMany({ where: { tenantId } });
    await db.financeCategory.deleteMany({ where: { tenantId } });
    await db.department.updateMany({ where: { tenantId }, data: { managerId: null } });
    await db.employee.deleteMany({ where: { tenantId } });
    await db.department.deleteMany({ where: { tenantId } });
    await db.issuingEntity.deleteMany({ where: { tenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.role.deleteMany({ where: { tenantId, isSystem: false } });

    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);
    await db.user.create({ data: { tenantId, email: HR.email, passwordHash: await hashPassword(HR.password), fullName: 'HR', role: 'HR_MANAGER', roleId: roleIds.get('hr_manager'), status: 'ACTIVE' } });
    await db.user.create({ data: { tenantId, email: EMP.email, passwordHash: await hashPassword(EMP.password), fullName: 'E', role: 'EMPLOYEE', roleId: roleIds.get('employee'), status: 'ACTIVE' } });

    const entity = await db.issuingEntity.create({ data: { tenantId, name: 'CC' } });
    const dept = await db.department.create({ data: { tenantId, name: 'Marketing' } });
    const acc = await db.fundAccount.create({ data: { tenantId, issuingEntityId: entity.id, name: 'A', type: 'BANK' } });
    const ads = await db.financeCategory.create({ data: { tenantId, kind: 'EXPENSE', name: 'Ads' } });

    // APPROVED plan: 10,000,000 for Marketing/Ads in 2026-08.
    await db.spendingPlan.create({
      data: {
        tenantId, departmentId: dept.id, issuingEntityId: entity.id, period: '2026-08', status: 'APPROVED',
        totalAmount: 10000000, createdById: 'seed',
        items: { create: [{ categoryId: ads.id, title: 'Ads', amount: 10000000 }] },
      },
    });
    // ACTUAL OUT 6,000,000 in Aug (under budget) + 1,000,000 in Sep (excluded).
    await db.cashTransaction.createMany({
      data: [
        { tenantId, accountId: acc.id, issuingEntityId: entity.id, direction: 'OUT', status: 'ACTUAL', amount: 6000000, occurredAt: new Date('2026-08-15'), categoryId: ads.id, departmentId: dept.id, createdById: 'seed' },
        { tenantId, accountId: acc.id, issuingEntityId: entity.id, direction: 'OUT', status: 'ACTUAL', amount: 1000000, occurredAt: new Date('2026-09-02'), categoryId: ads.id, departmentId: dept.id, createdById: 'seed' },
      ],
    });

    hrToken = await login(HR.email, HR.password);
    empToken = await login(EMP.email, EMP.password);
  });

  it('compares approved plan vs actual out for the period', async () => {
    const res = await request(app).get('/api/v1/finance/budget-vs-actual?month=2026-08').set('Authorization', `Bearer ${hrToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalPlanned).toBe('10000000');
    expect(res.body.data.totalActual).toBe('6000000'); // Sep row excluded
    const marketing = res.body.data.byDepartment.find((r: { label: string }) => r.label === 'Marketing');
    expect(marketing.planned).toBe('10000000');
    expect(marketing.actual).toBe('6000000');
    expect(marketing.variance).toBe('4000000');
    expect(marketing.usedPct).toBe(60);
    expect(marketing.over).toBe(false);
    const adsCat = res.body.data.byCategory.find((r: { label: string }) => r.label === 'Ads');
    expect(adsCat.usedPct).toBe(60);
  });

  it('forbids EMPLOYEE (403)', async () => {
    const res = await request(app).get('/api/v1/finance/budget-vs-actual').set('Authorization', `Bearer ${empToken}`);
    expect(res.status).toBe(403);
  });
});
