import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

// SPEC-048 GĐ2: cash flow forecast. Projected daily balance =
//   opening (current account balance) + PLANNED IN − (APPROVED plan items by
//   expectedDate + PLANNED OUT). Finds the first day balance < 0 (cash-out) + shortfall.
const SLUG = 'forecast-it';
const HR = { email: 'hr@forecast.com', password: 'HrTest@123' };
const EMP = { email: 'emp@forecast.com', password: 'EmpTest@123' };

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password, tenantSlug: SLUG });
  if (!res.body?.data?.accessToken) throw new Error(`login ${email} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

describe('Cash flow forecast', () => {
  let tenantId: string;
  let hrToken: string;
  let empToken: string;
  let entityId: string;
  let accountId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'Forecast IT', slug: SLUG } });
    tenantId = tenant.id;
    await db.spendingPlanItem.deleteMany({ where: { plan: { tenantId } } });
    await db.spendingPlan.deleteMany({ where: { tenantId } });
    await db.cashTransaction.deleteMany({ where: { tenantId } });
    await db.fundAccount.deleteMany({ where: { tenantId } });
    await db.financeCategory.deleteMany({ where: { tenantId } });
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
    entityId = entity.id;
    const dept = await db.department.create({ data: { tenantId, name: 'Marketing' } });
    // Opening balance 10,000,000.
    const acc = await db.fundAccount.create({ data: { tenantId, issuingEntityId: entity.id, name: 'A', type: 'BANK', openingBalance: 10000000, currentBalance: 10000000 } });
    accountId = acc.id;

    // Approved plan with a big expected outflow on 2026-08-20 → drives balance negative.
    await db.spendingPlan.create({
      data: {
        tenantId, departmentId: dept.id, issuingEntityId: entity.id, period: '2026-08', status: 'APPROVED',
        totalAmount: 15000000, createdById: 'seed',
        items: { create: [{ title: 'Big spend', amount: 15000000, expectedDate: new Date('2026-08-20') }] },
      },
    });
    // Planned IN 3,000,000 on 2026-08-10 (expected Ecom).
    await db.cashTransaction.create({
      data: { tenantId, accountId: acc.id, issuingEntityId: entity.id, direction: 'IN', status: 'PLANNED', amount: 3000000, occurredAt: new Date('2026-08-10'), createdById: 'seed' },
    });

    hrToken = await login(HR.email, HR.password);
    empToken = await login(EMP.email, EMP.password);
  });

  it('projects the daily balance, cash-out date and shortfall', async () => {
    const res = await request(app).get('/api/v1/finance/forecast?month=2026-08').set('Authorization', `Bearer ${hrToken}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.openingBalance).toBe('10000000');
    expect(d.expectedIn).toBe('3000000');
    expect(d.expectedOut).toBe('15000000');
    // 10,000,000 + 3,000,000 − 15,000,000 = −2,000,000
    expect(d.projectedEndBalance).toBe('-2000000');
    // Balance goes negative on the day of the big spend.
    expect(d.cashOutDate).toBe('2026-08-20');
    expect(d.shortfall).toBe('2000000');
    expect(d.series.length).toBeGreaterThan(0);
  });

  it('forbids EMPLOYEE (403)', async () => {
    const res = await request(app).get('/api/v1/finance/forecast').set('Authorization', `Bearer ${empToken}`);
    expect(res.status).toBe(403);
  });
});
