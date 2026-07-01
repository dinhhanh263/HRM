import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

// SPEC-048: cash transaction Excel/CSV import — stateless parse (preview) + confirm.
const SLUG = 'cash-import-it';
const HR = { email: 'hr@cashimport.com', password: 'HrTest@123' };
const EMP = { email: 'emp@cashimport.com', password: 'EmpTest@123' };

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

describe('CashTransaction Excel/CSV import', () => {
  let tenantId: string;
  let hrToken: string;
  let empToken: string;
  let accountId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'Cash Import IT', slug: SLUG } });
    tenantId = tenant.id;
    await cleanup(tenantId);
    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);
    await db.user.create({ data: { tenantId, email: HR.email, passwordHash: await hashPassword(HR.password), fullName: 'HR', role: 'HR_MANAGER', roleId: roleIds.get('hr_manager'), status: 'ACTIVE' } });
    await db.user.create({ data: { tenantId, email: EMP.email, passwordHash: await hashPassword(EMP.password), fullName: 'E', role: 'EMPLOYEE', roleId: roleIds.get('employee'), status: 'ACTIVE' } });

    const entity = await db.issuingEntity.create({ data: { tenantId, name: 'CC' } });
    const acc = await db.fundAccount.create({ data: { tenantId, issuingEntityId: entity.id, name: 'Main', type: 'BANK', openingBalance: 1000000, currentBalance: 1000000 } });
    accountId = acc.id;
    await db.financeCategory.create({ data: { tenantId, kind: 'EXPENSE', name: 'Ads' } });
    await db.financeCategory.create({ data: { tenantId, kind: 'INCOME', name: 'Ecom' } });

    hrToken = await login(HR.email, HR.password);
    empToken = await login(EMP.email, EMP.password);
  });

  // 3 rows: 2 valid (IN Ecom, OUT Ads) + 1 invalid (unknown account).
  const CSV = [
    'account,direction,amount,date,category,department,reference,description',
    'Main,IN,500000,2026-07-01,Ecom,,REF1,Shopee',
    'Main,OUT,200000,2026-07-02,Ads,,,Facebook',
    'Ghost Acc,OUT,50000,2026-07-03,Ads,,,bad row',
  ].join('\n');

  it('parse returns a per-row preview without writing anything', async () => {
    const res = await request(app)
      .post('/api/v1/cash-transactions/import/parse')
      .set('Authorization', `Bearer ${hrToken}`)
      .attach('file', Buffer.from(CSV, 'utf8'), { filename: 'tx.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.data.totalRows).toBe(3);
    expect(res.body.data.validCount).toBe(2);
    expect(res.body.data.errorCount).toBe(1);
    // Nothing persisted by parse.
    expect(await db.cashTransaction.count({ where: { tenantId } })).toBe(0);

    const badRow = res.body.data.rows.find((r: { rowNumber: number }) => r.rowNumber === 3);
    expect(badRow.errors[0].column).toBe('account');
  });

  it('confirm inserts only valid rows and recomputes the balance', async () => {
    const res = await request(app)
      .post('/api/v1/cash-transactions/import/confirm')
      .set('Authorization', `Bearer ${hrToken}`)
      .attach('file', Buffer.from(CSV, 'utf8'), { filename: 'tx.csv', contentType: 'text/csv' });

    expect(res.status).toBe(201);
    expect(res.body.data.created).toBe(2);
    expect(res.body.data.skipped).toBe(1);

    expect(await db.cashTransaction.count({ where: { tenantId } })).toBe(2);
    // 1,000,000 + 500,000 − 200,000 = 1,300,000
    const acc = await db.fundAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(acc.currentBalance.toString()).toBe('1300000');
    // Imported rows are tagged source=IMPORT.
    expect(await db.cashTransaction.count({ where: { tenantId, source: 'IMPORT' } })).toBe(2);
  });

  it('template downloads and EMPLOYEE cannot import (403)', async () => {
    const tpl = await request(app).get('/api/v1/cash-transactions/import/template').set('Authorization', `Bearer ${hrToken}`);
    expect(tpl.status).toBe(200);
    expect(tpl.headers['content-type']).toContain('spreadsheetml');

    const forbidden = await request(app)
      .post('/api/v1/cash-transactions/import/parse')
      .set('Authorization', `Bearer ${empToken}`)
      .attach('file', Buffer.from(CSV, 'utf8'), { filename: 'tx.csv', contentType: 'text/csv' });
    expect(forbidden.status).toBe(403);
  });
});
