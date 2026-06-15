import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

const TENANT_SLUG = 'payroll-settings-test-tenant';
const HR_EMAIL = 'hr@payroll-settings-test.com';
const HR_PASSWORD = 'HrTest@123';
const EMP_EMAIL = 'emp@payroll-settings-test.com';
const EMP_PASSWORD = 'EmpTest@123';

async function cleanup(tenantId: string) {
  await db.payrollSettings.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
}

describe('Payroll Settings API', () => {
  let tenantId: string;
  let hrToken: string;
  let empToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Payroll Settings Test Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;

    await cleanup(tenantId);

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
        fullName: 'Employee',
        role: 'EMPLOYEE',
        roleId: roleIdByKey.get('employee'),
        status: 'ACTIVE',
      },
    });

    const hrLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: HR_EMAIL, password: HR_PASSWORD, tenantSlug: TENANT_SLUG });
    hrToken = hrLogin.body.data.accessToken;

    const empLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMP_EMAIL, password: EMP_PASSWORD, tenantSlug: TENANT_SLUG });
    empToken = empLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await cleanup(tenantId);
  });

  it('should auto-seed VN defaults on first GET for HR', async () => {
    const res = await request(app)
      .get('/api/v1/payroll/settings')
      .set('Authorization', `Bearer ${hrToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.socialInsuranceRate).toBe(0.08);
    expect(res.body.data.personalDeduction).toBe('11000000');
    expect(res.body.data.taxBrackets).toHaveLength(7);
  });

  it('should persist an HR settings update', async () => {
    const res = await request(app)
      .patch('/api/v1/payroll/settings')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ payDay: 10, dependentDeduction: '4600000' });

    expect(res.status).toBe(200);
    expect(res.body.data.payDay).toBe(10);
    expect(res.body.data.dependentDeduction).toBe('4600000');
  });

  it('should reject a non-monotonic tax bracket update with 400', async () => {
    const res = await request(app)
      .patch('/api/v1/payroll/settings')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        taxBrackets: [
          { upTo: 10_000_000, rate: 0.05 },
          { upTo: 5_000_000, rate: 0.1 },
          { upTo: null, rate: 0.2 },
        ],
      });

    expect(res.status).toBe(400);
  });

  it('should forbid an EMPLOYEE from reading settings', async () => {
    const res = await request(app)
      .get('/api/v1/payroll/settings')
      .set('Authorization', `Bearer ${empToken}`);

    expect(res.status).toBe(403);
  });

  it('should forbid an EMPLOYEE from updating settings', async () => {
    const res = await request(app)
      .patch('/api/v1/payroll/settings')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ payDay: 15 });

    expect(res.status).toBe(403);
  });
});
