import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

const TENANT_SLUG = 'payroll-run-test-tenant';
const OTHER_SLUG = 'payroll-run-other-tenant';
const HR_EMAIL = 'hr@payroll-run-test.com';
const HR_PASSWORD = 'HrTest@123';
const EMP_EMAIL = 'emp@payroll-run-test.com';
const EMP_PASSWORD = 'EmpTest@123';
const OTHER_HR_EMAIL = 'hr@payroll-run-other.com';
const OTHER_HR_PASSWORD = 'HrOther@123';

const PERIOD = '2026-01';

async function cleanup(tenantId: string) {
  await db.payslip.deleteMany({ where: { tenantId } });
  await db.payrollRun.deleteMany({ where: { tenantId } });
  await db.payrollSettings.deleteMany({ where: { tenantId } });
  await db.employeeSalary.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
}

async function login(email: string, password: string, tenantSlug: string) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password, tenantSlug });
  return res.body.data.accessToken as string;
}

describe('Payroll Run API', () => {
  let tenantId: string;
  let otherTenantId: string;
  let hrToken: string;
  let empToken: string;
  let otherHrToken: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Payroll Run Test Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;
    const other = await db.tenant.upsert({
      where: { slug: OTHER_SLUG },
      update: {},
      create: { name: 'Payroll Run Other Tenant', slug: OTHER_SLUG },
    });
    otherTenantId = other.id;

    await cleanup(tenantId);
    await cleanup(otherTenantId);

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);
    const otherRoleIdByKey = await syncSystemRolesForTenant(db, otherTenantId);

    // HR (payroll:process + view) and a plain EMPLOYEE in the main tenant.
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

    // Other tenant HR — for tenant-isolation checks.
    await db.user.create({
      data: {
        tenantId: otherTenantId,
        email: OTHER_HR_EMAIL,
        passwordHash: await hashPassword(OTHER_HR_PASSWORD),
        fullName: 'Other HR',
        role: 'HR_MANAGER',
        roleId: otherRoleIdByKey.get('hr_manager'),
        status: 'ACTIVE',
      },
    });

    // Each Employee requires its own (unique) User. Two ACTIVE employees with an
    // in-force salary at period end → both payable.
    const makeEmployee = async (
      code: string,
      fullName: string,
      dependentsCount: number,
    ) => {
      const user = await db.user.create({
        data: {
          tenantId,
          email: `${code.toLowerCase()}@payroll-run-test.com`,
          passwordHash: 'x',
          fullName,
          role: 'EMPLOYEE',
          status: 'ACTIVE',
        },
      });
      return db.employee.create({
        data: {
          tenantId,
          userId: user.id,
          employeeCode: code,
          fullName,
          joinDate: new Date('2023-01-01'),
          contractType: 'FULL_TIME',
          status: 'ACTIVE',
          dependentsCount,
        },
      });
    };

    const a = await makeEmployee('PR-1', 'Payable A', 1);
    const b = await makeEmployee('PR-2', 'Payable B', 0);
    // An ACTIVE employee with NO salary → must be skipped, not counted.
    await makeEmployee('PR-3', 'No Salary', 0);

    await db.employeeSalary.create({
      data: {
        tenantId,
        employeeId: a.id,
        baseSalary: 30_000_000,
        allowances: [{ name: 'Ăn trưa', amount: 730_000, taxable: true }],
        effectiveFrom: new Date('2025-01-01'),
      },
    });
    await db.employeeSalary.create({
      data: {
        tenantId,
        employeeId: b.id,
        baseSalary: 20_000_000,
        allowances: [],
        effectiveFrom: new Date('2025-01-01'),
      },
    });

    hrToken = await login(HR_EMAIL, HR_PASSWORD, TENANT_SLUG);
    empToken = await login(EMP_EMAIL, EMP_PASSWORD, TENANT_SLUG);
    otherHrToken = await login(OTHER_HR_EMAIL, OTHER_HR_PASSWORD, OTHER_SLUG);
  });

  afterAll(async () => {
    await cleanup(tenantId);
    await cleanup(otherTenantId);
  });

  it('should create a DRAFT run with a line per payable employee and matching totals', async () => {
    const res = await request(app)
      .post('/api/v1/payroll/runs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ period: PERIOD });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.period).toBe(PERIOD);
    // Only the two salaried employees are payable; PR-3 is skipped.
    expect(res.body.data.headcount).toBe(2);
    expect(res.body.data.payslips).toHaveLength(2);

    const sum = (key: string) =>
      res.body.data.payslips.reduce((acc: number, p: Record<string, string>) => acc + Number(p[key]), 0);
    expect(Number(res.body.data.totalGross)).toBe(sum('grossPay'));
    expect(Number(res.body.data.totalNet)).toBe(sum('netPay'));
    const deductions = res.body.data.payslips.reduce(
      (acc: number, p: Record<string, string>) =>
        acc + Number(p.insuranceTotal) + Number(p.personalIncomeTax) + Number(p.otherDeductions),
      0,
    );
    expect(Number(res.body.data.totalDeductions)).toBe(deductions);
  });

  it('should idempotently replace lines when re-creating the same DRAFT period', async () => {
    const res = await request(app)
      .post('/api/v1/payroll/runs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ period: PERIOD });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.headcount).toBe(2);
    expect(res.body.data.payslips).toHaveLength(2);

    const runs = await db.payrollRun.findMany({ where: { tenantId, period: PERIOD } });
    expect(runs).toHaveLength(1); // still a single run for the period
  });

  it('should reject re-creating an APPROVED run with 409', async () => {
    await db.payrollRun.updateMany({
      where: { tenantId, period: PERIOD },
      data: { status: 'APPROVED' },
    });

    const res = await request(app)
      .post('/api/v1/payroll/runs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ period: PERIOD });

    expect(res.status).toBe(409);

    // restore to DRAFT so the rest of the suite is unaffected
    await db.payrollRun.updateMany({
      where: { tenantId, period: PERIOD },
      data: { status: 'DRAFT' },
    });
  });

  it('should reject an invalid period format with 422', async () => {
    const res = await request(app)
      .post('/api/v1/payroll/runs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ period: '2026-13' });

    expect(res.status).toBe(422);
  });

  it('should forbid an EMPLOYEE from creating a run', async () => {
    const res = await request(app)
      .post('/api/v1/payroll/runs')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ period: '2026-02' });

    expect(res.status).toBe(403);
  });

  it('should list runs for HR', async () => {
    const res = await request(app)
      .get('/api/v1/payroll/runs')
      .set('Authorization', `Bearer ${hrToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some((r: { period: string }) => r.period === PERIOD)).toBe(true);
  });

  it('should not expose a run to another tenant (404)', async () => {
    const run = await db.payrollRun.findFirst({ where: { tenantId, period: PERIOD } });
    const res = await request(app)
      .get(`/api/v1/payroll/runs/${run!.id}`)
      .set('Authorization', `Bearer ${otherHrToken}`);

    expect(res.status).toBe(404);
  });
});
