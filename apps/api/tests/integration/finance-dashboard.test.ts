import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

// SPEC-048: finance dashboard aggregates (balance, period IN/OUT/net, series, categories).
const SLUG = 'fin-dash-it';
const HR = { email: 'hr@findash.com', password: 'HrTest@123' };
const EMP = { email: 'emp@findash.com', password: 'EmpTest@123' };

async function cleanup(tenantId: string) {
  await db.cashTransaction.deleteMany({ where: { tenantId } });
  await db.fundAccount.deleteMany({ where: { tenantId } });
  await db.financeCategory.deleteMany({ where: { tenantId } });
  await db.issuingEntity.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password, tenantSlug: SLUG });
  return res.body.data.accessToken;
}

describe('Finance dashboard aggregates', () => {
  let tenantId: string;
  let hrToken: string;
  let empToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'Fin Dash IT', slug: SLUG } });
    tenantId = tenant.id;
    await cleanup(tenantId);
    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);
    await db.user.create({ data: { tenantId, email: HR.email, passwordHash: await hashPassword(HR.password), fullName: 'HR', role: 'HR_MANAGER', roleId: roleIds.get('hr_manager'), status: 'ACTIVE' } });
    await db.user.create({ data: { tenantId, email: EMP.email, passwordHash: await hashPassword(EMP.password), fullName: 'E', role: 'EMPLOYEE', roleId: roleIds.get('employee'), status: 'ACTIVE' } });

    const entity = await db.issuingEntity.create({ data: { tenantId, name: 'CC' } });
    const acc = await db.fundAccount.create({ data: { tenantId, issuingEntityId: entity.id, name: 'A', type: 'BANK', openingBalance: 10000000, currentBalance: 10000000 } });
    const ads = await db.financeCategory.create({ data: { tenantId, kind: 'EXPENSE', name: 'Ads' } });
    const base = { tenantId, accountId: acc.id, issuingEntityId: entity.id, createdById: 'seed', status: 'ACTUAL' as const };
    // Two July rows + one PLANNED (excluded) + one out-of-period June row (excluded).
    await db.cashTransaction.createMany({
      data: [
        { ...base, direction: 'IN', amount: 5000000, occurredAt: new Date('2026-07-03') },
        { ...base, direction: 'OUT', amount: 2000000, occurredAt: new Date('2026-07-10'), categoryId: ads.id },
        { ...base, status: 'PLANNED', direction: 'IN', amount: 9999999, occurredAt: new Date('2026-07-15') },
        { ...base, direction: 'OUT', amount: 1000000, occurredAt: new Date('2026-06-20'), categoryId: ads.id },
      ],
    });

    hrToken = await login(HR.email, HR.password);
    empToken = await login(EMP.email, EMP.password);
  });

  it('aggregates balance, period totals, series and categories', async () => {
    const res = await request(app)
      .get('/api/v1/finance/dashboard?month=2026-07')
      .set('Authorization', `Bearer ${hrToken}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.period).toBe('2026-07');
    // Balance is current (as of now), not period-scoped.
    expect(d.totalBalance).toBe('10000000');
    // Period ACTUAL only: IN 5,000,000 / OUT 2,000,000 (June + PLANNED excluded).
    expect(d.totalIn).toBe('5000000');
    expect(d.totalOut).toBe('2000000');
    expect(d.net).toBe('3000000');
    expect(d.series.length).toBe(2); // 2 distinct July days
    expect(d.byCategory[0].name).toBe('Ads');
    expect(d.byCategory[0].total).toBe('2000000');
  });

  it('forbids EMPLOYEE (403)', async () => {
    const res = await request(app).get('/api/v1/finance/dashboard').set('Authorization', `Bearer ${empToken}`);
    expect(res.status).toBe(403);
  });
});
