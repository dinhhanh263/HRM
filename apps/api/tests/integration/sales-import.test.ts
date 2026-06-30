import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../../src/domain/rbac/catalog.js';

// SPEC-045 Task 1.5 — Customer import (xlsx) → Lead Pool, with dry-run preview + dedupe.
const SLUG = 'sales-import-tenant';
const ADMIN = { email: 'admin@salesimport.com', password: 'Admin@123' };
const HEADERS = ['Loại', 'Họ tên', 'Email', 'Số điện thoại', 'Chức danh', 'Nguồn', 'Địa chỉ'];

async function cleanup(tenantId: string) {
  await db.customer.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.role.deleteMany({ where: { tenantId, isSystem: false } });
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password, tenantSlug: SLUG });
  return res.body.data.accessToken;
}

async function xlsx(rows: string[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('s');
  ws.addRow(HEADERS);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

describe('Sales customer import (dry-run + commit + dedupe → Lead Pool)', () => {
  let tenantId: string;
  let token: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({ where: { slug: SLUG }, update: {}, create: { name: 'Sales Import', slug: SLUG } });
    tenantId = tenant.id;
    await cleanup(tenantId);
    await seedPermissionCatalog(db);
    const roleIds = await syncSystemRolesForTenant(db, tenantId);
    await db.user.create({ data: { tenantId, email: ADMIN.email, passwordHash: await hashPassword(ADMIN.password), fullName: 'Admin', role: 'SUPER_ADMIN', roleId: roleIds.get('super_admin'), status: 'ACTIVE' } });
    token = await login(ADMIN.email, ADMIN.password);
  });

  it('dry-run validates + dedupes within file and creates nothing', async () => {
    const buf = await xlsx([
      ['B2C', 'Nguyễn A', 'a@x.com', '0901112223', '', 'WEB', ''],
      ['B2C', '', 'noname@x.com', '', '', '', ''], // missing name
      ['B2C', 'Dup In File', 'a@x.com', '', '', '', ''], // dup email in file
    ]);
    const res = await request(app)
      .post('/api/v1/sales/customers/import?dryRun=1')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buf, 'import.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.valid).toBe(1);
    expect(res.body.data.created).toBe(0);
    expect(res.body.data.skipped).toHaveLength(2);
    expect(await db.customer.count({ where: { tenantId } })).toBe(0);
  });

  it('commit creates valid rows into the Lead Pool (ownerId null, source IMPORT)', async () => {
    const buf = await xlsx([
      ['B2B', 'Công ty X', 'x@corp.com', '0911222333', 'CEO', 'REFERRAL', 'HN'],
      ['B2C', 'Khách Y', 'y@x.com', '', '', '', ''],
    ]);
    const res = await request(app)
      .post('/api/v1/sales/customers/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buf, 'import.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(2);

    const created = await db.customer.findMany({ where: { tenantId } });
    expect(created).toHaveLength(2);
    expect(created.every((c) => c.ownerId === null)).toBe(true); // Lead Pool
    const x = created.find((c) => c.email === 'x@corp.com')!;
    expect(x.source).toBe('REFERRAL');
    expect(x.phone).toBe('+84911222333'); // normalized
    const y = created.find((c) => c.email === 'y@x.com')!;
    expect(y.source).toBe('IMPORT'); // default when source column empty
  });

  it('skips rows that duplicate existing customers', async () => {
    const buf = await xlsx([['B2C', 'Dup Existing', 'x@corp.com', '', '', '', '']]);
    const res = await request(app)
      .post('/api/v1/sales/customers/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buf, 'import.xlsx');
    expect(res.body.data.created).toBe(0);
    expect(res.body.data.skipped[0].reason).toContain('tồn tại');
  });

  it('serves a downloadable template', async () => {
    const res = await request(app).get('/api/v1/sales/customers/import/template').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('customer-import-template');
    expect(res.body.length ?? res.text.length).toBeGreaterThan(0);
  });
});
