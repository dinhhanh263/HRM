import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';
import { IMPORT_ERROR_CODES } from '@hrm/shared';

const TEST_TENANT_SLUG = 'import-test-tenant';
const OTHER_TENANT_SLUG = 'import-other-tenant';
const HR_USER_EMAIL = 'hr@import-test.com';
const HR_USER_PASSWORD = 'HrTest@123';
const EMP_USER_EMAIL = 'emp@import-test.com';
const EMP_USER_PASSWORD = 'EmpTest@123';
const OTHER_TENANT_EMAIL = 'someone@other-tenant.com';

const CANONICAL_HEADERS = [
  'employeeCode',
  'fullName',
  'email',
  'dateOfBirth',
  'gender',
  'idNumber',
  'phone',
  'department',
  'position',
  'manager',
  'joinDate',
  'contractType',
  'role',
];

/** Build a CSV buffer from a 2D array of data rows (header prepended). */
function makeCsv(dataRows: string[][]): Buffer {
  const lines = [CANONICAL_HEADERS.join(','), ...dataRows.map((r) => r.join(','))];
  return Buffer.from(lines.join('\n'), 'utf-8');
}

/** A full row with only the provided fields set. Employee code is required, so
 *  derive a unique one from the email local-part when not set explicitly. */
function row(fields: Partial<Record<string, string>>): string[] {
  const withCode: Partial<Record<string, string>> = {
    ...fields,
    employeeCode: fields.employeeCode ?? (fields.email ? `NV-${fields.email.split('@')[0]}` : ''),
  };
  return CANONICAL_HEADERS.map((h) => withCode[h] ?? '');
}

describe('Employee Import API — POST /employees/import/validate', () => {
  let testTenantId: string;
  let accessToken: string;
  let employeeToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TEST_TENANT_SLUG },
      update: {},
      create: { name: 'Import Test Tenant', slug: TEST_TENANT_SLUG },
    });
    testTenantId = tenant.id;

    const otherTenant = await db.tenant.upsert({
      where: { slug: OTHER_TENANT_SLUG },
      update: {},
      create: { name: 'Import Other Tenant', slug: OTHER_TENANT_SLUG },
    });

    await db.employee.deleteMany({ where: { tenantId: testTenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId: testTenantId } } });
    await db.user.deleteMany({ where: { tenantId: testTenantId } });
    await db.position.deleteMany({ where: { tenantId: testTenantId } });
    await db.department.deleteMany({ where: { tenantId: testTenantId } });
    await db.user.deleteMany({ where: { tenantId: otherTenant.id } });

    // An existing department, so we can prove new-vs-existing org-unit detection.
    await db.department.create({ data: { tenantId: testTenantId, name: 'Engineering' } });

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, testTenantId);

    await db.user.create({
      data: {
        tenantId: testTenantId,
        email: HR_USER_EMAIL,
        passwordHash: await hashPassword(HR_USER_PASSWORD),
        fullName: 'HR Manager',
        role: 'HR_MANAGER',
        roleId: roleIdByKey.get('hr_manager'),
        status: 'ACTIVE',
      },
    });

    await db.user.create({
      data: {
        tenantId: testTenantId,
        email: EMP_USER_EMAIL,
        passwordHash: await hashPassword(EMP_USER_PASSWORD),
        fullName: 'Plain Employee',
        role: 'EMPLOYEE',
        roleId: roleIdByKey.get('employee'),
        status: 'ACTIVE',
      },
    });

    // A user in ANOTHER tenant — must not collide with this tenant's emails.
    await db.user.create({
      data: {
        tenantId: otherTenant.id,
        email: OTHER_TENANT_EMAIL,
        passwordHash: await hashPassword('Other@123'),
        fullName: 'Other Tenant User',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      },
    });

    accessToken = (
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: HR_USER_EMAIL, password: HR_USER_PASSWORD, tenantSlug: TEST_TENANT_SLUG })
    ).body.data.accessToken;

    employeeToken = (
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: EMP_USER_EMAIL, password: EMP_USER_PASSWORD, tenantSlug: TEST_TENANT_SLUG })
    ).body.data.accessToken;
  });

  afterAll(async () => {
    await db.employee.deleteMany({ where: { tenantId: testTenantId } });
    await db.refreshToken.deleteMany({ where: { user: { tenantId: testTenantId } } });
    await db.user.deleteMany({ where: { tenantId: testTenantId } });
    await db.position.deleteMany({ where: { tenantId: testTenantId } });
    await db.department.deleteMany({ where: { tenantId: testTenantId } });
    await db.tenant.deleteMany({ where: { slug: { in: [TEST_TENANT_SLUG, OTHER_TENANT_SLUG] } } });
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).post('/api/v1/employees/import/validate');
    expect(res.status).toBe(401);
  });

  it('returns 403 for a user lacking employees:import (EMPLOYEE role)', async () => {
    const res = await request(app)
      .post('/api/v1/employees/import/validate')
      .set('Authorization', `Bearer ${employeeToken}`)
      .attach('file', makeCsv([row({ fullName: 'A', email: 'a@x.com' })]), 'employees.csv');
    expect(res.status).toBe(403);
  });

  it('validates a clean file and stages it (importId) without writing the DB', async () => {
    const before = await db.user.count({ where: { tenantId: testTenantId } });

    const res = await request(app)
      .post('/api/v1/employees/import/validate')
      .set('Authorization', `Bearer ${accessToken}`)
      .field('autoCreateOrgUnits', 'true')
      .attach(
        'file',
        makeCsv([
          row({ fullName: 'Nguyen Van A', email: 'a@import.com', department: 'Engineering' }),
          row({ fullName: 'Tran Thi B', email: 'b@import.com' }),
        ]),
        'employees.csv',
      );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalRows).toBe(2);
    expect(res.body.data.validCount).toBe(2);
    expect(res.body.data.errorCount).toBe(0);
    expect(typeof res.body.data.importId).toBe('string');

    // Dry-run: nothing persisted.
    const after = await db.user.count({ where: { tenantId: testTenantId } });
    expect(after).toBe(before);
  });

  it('flags per-row errors (missing required + invalid email) and excludes them', async () => {
    const res = await request(app)
      .post('/api/v1/employees/import/validate')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach(
        'file',
        makeCsv([
          row({ fullName: 'Good One', email: 'good@import.com' }),
          row({ fullName: '', email: 'noname@import.com' }), // missing fullName
          row({ fullName: 'Bad Email', email: 'not-an-email' }), // invalid email
        ]),
        'employees.csv',
      );

    expect(res.status).toBe(200);
    expect(res.body.data.totalRows).toBe(3);
    expect(res.body.data.validCount).toBe(1);
    const codes = res.body.data.errors.map((e: { code: string }) => e.code);
    expect(codes).toContain(IMPORT_ERROR_CODES.MISSING_REQUIRED);
    expect(codes).toContain(IMPORT_ERROR_CODES.INVALID_EMAIL);
  });

  it('flags IMPORT_EMAIL_EXISTS for an email already in the tenant', async () => {
    const res = await request(app)
      .post('/api/v1/employees/import/validate')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach(
        'file',
        makeCsv([row({ fullName: 'Existing', email: HR_USER_EMAIL })]),
        'employees.csv',
      );

    expect(res.status).toBe(200);
    expect(res.body.data.validCount).toBe(0);
    expect(res.body.data.errors[0].code).toBe(IMPORT_ERROR_CODES.EMAIL_EXISTS);
  });

  it('does NOT flag an email that exists only in another tenant', async () => {
    const res = await request(app)
      .post('/api/v1/employees/import/validate')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach(
        'file',
        makeCsv([row({ fullName: 'Cross Tenant', email: OTHER_TENANT_EMAIL })]),
        'employees.csv',
      );

    expect(res.status).toBe(200);
    expect(res.body.data.validCount).toBe(1);
    expect(res.body.data.errorCount).toBe(0);
  });

  it('detects new org units referenced by valid rows', async () => {
    const res = await request(app)
      .post('/api/v1/employees/import/validate')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach(
        'file',
        makeCsv([
          row({ fullName: 'C', email: 'c@import.com', department: 'Engineering', position: 'Senior Dev' }),
          row({ fullName: 'D', email: 'd@import.com', department: 'Marketing' }),
        ]),
        'employees.csv',
      );

    expect(res.status).toBe(200);
    // 'Engineering' already exists; 'Marketing' is new. 'Senior Dev' position is new.
    expect(res.body.data.newDepartments).toContain('Marketing');
    expect(res.body.data.newDepartments).not.toContain('Engineering');
    expect(res.body.data.newPositions).toContain('Senior Dev');
  });

  it('resolves a forward-referenced manager but flags an unknown one', async () => {
    const res = await request(app)
      .post('/api/v1/employees/import/validate')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach(
        'file',
        makeCsv([
          row({ fullName: 'Boss', email: 'boss@import.com' }),
          row({ fullName: 'Report', email: 'report@import.com', manager: 'boss@import.com' }), // forward ref OK
          row({ fullName: 'Orphan', email: 'orphan@import.com', manager: 'ghost@nowhere.com' }), // unknown
        ]),
        'employees.csv',
      );

    expect(res.status).toBe(200);
    expect(res.body.data.validCount).toBe(2); // Boss + Report
    const managerErrors = res.body.data.errors.filter(
      (e: { code: string }) => e.code === IMPORT_ERROR_CODES.MANAGER_NOT_FOUND,
    );
    expect(managerErrors).toHaveLength(1);
    expect(managerErrors[0].row).toBe(3);
  });

  it('returns a file-level error and no importId for a header-only file', async () => {
    const res = await request(app)
      .post('/api/v1/employees/import/validate')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', makeCsv([]), 'employees.csv');

    expect(res.status).toBe(200);
    expect(res.body.data.importId).toBeNull();
    expect(res.body.data.errors[0].code).toBe(IMPORT_ERROR_CODES.EMPTY_FILE);
  });

  it('returns IMPORT_MISSING_COLUMNS when a required column is absent', async () => {
    const csv = Buffer.from(['fullName,phone', 'No Email,0900000000'].join('\n'), 'utf-8');
    const res = await request(app)
      .post('/api/v1/employees/import/validate')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', csv, 'employees.csv');

    expect(res.status).toBe(200);
    expect(res.body.data.errors[0].code).toBe(IMPORT_ERROR_CODES.MISSING_COLUMNS);
  });

  it('returns 400 when no file is attached', async () => {
    const res = await request(app)
      .post('/api/v1/employees/import/validate')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
  });
});
