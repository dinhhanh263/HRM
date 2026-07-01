import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

// SPEC-048 GĐ3: multi-entity finance report (ACTUAL thu/chi by month/entity/category) + Excel.
const SLUG = 'fin-report-it';
const HR = { email: 'hr@finreport.com', password: 'HrTest@123' };
const EMP = { email: 'emp@finreport.com', password: 'EmpTest@123' };

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password, tenantSlug: SLUG });
  return res.body.data.accessToken;
}

describe('Multi-entity finance report', () => {
  let tenantId: string;
  let hrToken: string;
  let empToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'Report IT', slug: SLUG } });
    tenantId = tenant.id;
    await db.cashTransaction.deleteMany({ where: { tenantId } });
    await db.fundAccount.deleteMany({ where: { tenantId } });
    await db.financeCategory.deleteMany({ where: { tenantId } });
    await db.issuingEntity.deleteMany({ where: { tenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.role.deleteMany({ where: { tenantId, isSystem: false } });

    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);
    await db.user.create({ data: { tenantId, email: HR.email, passwordHash: await hashPassword(HR.password), fullName: 'HR', role: 'HR_MANAGER', roleId: roleIds.get('hr_manager'), status: 'ACTIVE' } });
    await db.user.create({ data: { tenantId, email: EMP.email, passwordHash: await hashPassword(EMP.password), fullName: 'E', role: 'EMPLOYEE', roleId: roleIds.get('employee'), status: 'ACTIVE' } });

    const eCC = await db.issuingEntity.create({ data: { tenantId, name: 'Codecrush' } });
    const eHale = await db.issuingEntity.create({ data: { tenantId, name: 'Ha Le' } });
    const accCC = await db.fundAccount.create({ data: { tenantId, issuingEntityId: eCC.id, name: 'CC', type: 'BANK' } });
    const accHale = await db.fundAccount.create({ data: { tenantId, issuingEntityId: eHale.id, name: 'HL', type: 'CASH' } });
    const base = { tenantId, status: 'ACTUAL' as const, createdById: 'seed' };
    await db.cashTransaction.createMany({
      data: [
        { ...base, accountId: accCC.id, issuingEntityId: eCC.id, direction: 'IN', amount: 30000000, occurredAt: new Date('2026-03-10') },
        { ...base, accountId: accCC.id, issuingEntityId: eCC.id, direction: 'OUT', amount: 8000000, occurredAt: new Date('2026-03-15') },
        { ...base, accountId: accHale.id, issuingEntityId: eHale.id, direction: 'IN', amount: 5000000, occurredAt: new Date('2026-07-01') },
        // Out-of-year row (excluded).
        { ...base, accountId: accCC.id, issuingEntityId: eCC.id, direction: 'IN', amount: 999, occurredAt: new Date('2025-12-31') },
      ],
    });

    hrToken = await login(HR.email, HR.password);
    empToken = await login(EMP.email, EMP.password);
  });

  it('aggregates ACTUAL by month + entity for the year', async () => {
    const res = await request(app).get('/api/v1/finance/report?year=2026').set('Authorization', `Bearer ${hrToken}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.year).toBe(2026);
    expect(d.months).toHaveLength(12);
    expect(d.totalIn).toBe('35000000'); // 30M + 5M (2025 row excluded)
    expect(d.totalOut).toBe('8000000');
    expect(d.net).toBe('27000000');
    // March = in 30M / out 8M
    expect(d.months[2].in).toBe('30000000');
    expect(d.months[2].out).toBe('8000000');
    expect(d.byEntity.length).toBe(2);
  });

  it('exports an .xlsx and forbids EMPLOYEE from the report (403)', async () => {
    const xlsx = await request(app).get('/api/v1/finance/report/export?year=2026').set('Authorization', `Bearer ${hrToken}`);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');

    const forbidden = await request(app).get('/api/v1/finance/report?year=2026').set('Authorization', `Bearer ${empToken}`);
    expect(forbidden.status).toBe(403);
  });
});
