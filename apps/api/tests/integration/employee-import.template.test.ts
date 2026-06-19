import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';
import { parseEmployeeFile } from '../../src/domain/employee-import/employee-import.parser.js';
import { IMPORT_COLUMNS } from '@hrm/shared';

const TENANT_SLUG = 'import-template-tenant';
const HR_EMAIL = 'hr@import-template.com';
const HR_PASSWORD = 'HrTpl@123';
const EMP_EMAIL = 'emp@import-template.com';
const EMP_PASSWORD = 'EmpTpl@123';

describe('Employee Import API — GET /employees/import/template', () => {
  let tenantId: string;
  let hrToken: string;
  let employeeToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Import Template Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;

    await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await db.user.deleteMany({ where: { tenantId } });

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);

    await db.user.create({
      data: {
        tenantId,
        email: HR_EMAIL,
        passwordHash: await hashPassword(HR_PASSWORD),
        fullName: 'HR Manager',
        role: 'HR_MANAGER',
        roleId: roleIdByKey.get('hr_manager'),
        status: 'ACTIVE',
      },
    });
    await db.user.create({
      data: {
        tenantId,
        email: EMP_EMAIL,
        passwordHash: await hashPassword(EMP_PASSWORD),
        fullName: 'Plain Employee',
        role: 'EMPLOYEE',
        roleId: roleIdByKey.get('employee'),
        status: 'ACTIVE',
      },
    });

    hrToken = (
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: HR_EMAIL, password: HR_PASSWORD, tenantSlug: TENANT_SLUG })
    ).body.data.accessToken;
    employeeToken = (
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: EMP_EMAIL, password: EMP_PASSWORD, tenantSlug: TENANT_SLUG })
    ).body.data.accessToken;
  });

  afterAll(async () => {
    await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.tenant.deleteMany({ where: { slug: TENANT_SLUG } });
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/v1/employees/import/template');
    expect(res.status).toBe(401);
  });

  it('returns 403 for a user lacking employees:import (EMPLOYEE role)', async () => {
    const res = await request(app)
      .get('/api/v1/employees/import/template')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(403);
  });

  it('serves an .xlsx template by default with the right headers', async () => {
    const res = await request(app)
      .get('/api/v1/employees/import/template')
      .set('Authorization', `Bearer ${hrToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.headers['content-disposition']).toContain('.xlsx');
    expect((res.body as Buffer).length).toBeGreaterThan(0);
  });

  it('produces an .xlsx that round-trips back through the parser (all columns recognized)', async () => {
    const res = await request(app)
      .get('/api/v1/employees/import/template?lang=vi')
      .set('Authorization', `Bearer ${hrToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    const parsed = await parseEmployeeFile(res.body as Buffer, 'xlsx');
    // Localized headers are recognized → no file-level (missing-columns) errors.
    expect(parsed.errors).toHaveLength(0);
    // The two example rows survive the round-trip.
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].fullName).toBeTruthy();
    expect(parsed.rows[0].email).toContain('@');
  });

  it('embeds dropdown (list) data-validations on the enum columns', async () => {
    const res = await request(app)
      .get('/api/v1/employees/import/template?format=xlsx&lang=en')
      .set('Authorization', `Bearer ${hrToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0];

    const genderCol = IMPORT_COLUMNS.indexOf('gender') + 1;
    const letter = sheet.getColumn(genderCol).letter;
    const validation = sheet.getCell(`${letter}2`).dataValidation;
    expect(validation?.type).toBe('list');
    expect(validation?.formulae?.[0]).toContain('MALE');
    expect(validation?.formulae?.[0]).toContain('FEMALE');
  });

  it('serves a .csv variant that round-trips through the parser', async () => {
    const res = await request(app)
      .get('/api/v1/employees/import/template?format=csv&lang=en')
      .set('Authorization', `Bearer ${hrToken}`)
      .buffer(true)
      .parse((r, cb) => {
        let data = '';
        r.setEncoding('utf8');
        r.on('data', (c: string) => (data += c));
        r.on('end', () => cb(null, Buffer.from(data, 'utf8')));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('.csv');

    const parsed = await parseEmployeeFile(res.body as Buffer, 'csv');
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.rows).toHaveLength(2);
  });
});
