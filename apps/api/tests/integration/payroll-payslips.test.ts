import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

const TENANT_SLUG = 'payroll-payslips-tenant';
const HR_EMAIL = 'hr@payroll-payslips.com';
const HR_PASSWORD = 'HrTest@123';
const EMP_A_EMAIL = 'emp-a@payroll-payslips.com';
const EMP_B_EMAIL = 'emp-b@payroll-payslips.com';
const EMP_PASSWORD = 'EmpTest@123';

const APPROVED_PERIOD = '2026-01';
const DRAFT_PERIOD = '2026-02';

async function cleanup(tenantId: string) {
  await db.payslip.deleteMany({ where: { tenantId } });
  await db.payrollRun.deleteMany({ where: { tenantId } });
  await db.payrollSettings.deleteMany({ where: { tenantId } });
  await db.employeeSalary.deleteMany({ where: { tenantId } });
  await db.employee.deleteMany({ where: { tenantId } });
  await db.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
}

async function login(email: string, password: string) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password, tenantSlug: TENANT_SLUG });
  return res.body.data.accessToken as string;
}

async function seedPayable(tenantId: string, roleId: string, email: string, code: string) {
  const user = await db.user.create({
    data: {
      tenantId,
      email,
      passwordHash: await hashPassword(EMP_PASSWORD),
      fullName: code,
      role: 'EMPLOYEE',
      roleId,
      status: 'ACTIVE',
    },
  });
  const employee = await db.employee.create({
    data: {
      tenantId,
      userId: user.id,
      employeeCode: code,
      fullName: code,
      joinDate: new Date('2023-01-01'),
      contractType: 'FULL_TIME',
      status: 'ACTIVE',
      dependentsCount: 1,
    },
  });
  await db.employeeSalary.create({
    data: {
      tenantId,
      employeeId: employee.id,
      baseSalary: 30_000_000,
      allowances: [{ name: 'Ăn trưa', amount: 730_000, taxable: true }],
      effectiveFrom: new Date('2025-01-01'),
    },
  });
  return employee.id;
}

describe('Payroll payslip views (self-scope)', () => {
  let tenantId: string;
  let hrToken: string;
  let empAToken: string;
  let empBToken: string;
  let empAId: string;
  let empBId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Payroll Payslips Tenant', slug: TENANT_SLUG },
    });
    tenantId = tenant.id;

    await cleanup(tenantId);

    await seedPermissionCatalog(db);
    const roleIdByKey = await syncSystemRolesForTenant(db, tenantId);
    const employeeRoleId = roleIdByKey.get('employee')!;

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

    empAId = await seedPayable(tenantId, employeeRoleId, EMP_A_EMAIL, 'EMP-A');
    empBId = await seedPayable(tenantId, employeeRoleId, EMP_B_EMAIL, 'EMP-B');

    hrToken = await login(HR_EMAIL, HR_PASSWORD);
    empAToken = await login(EMP_A_EMAIL, EMP_PASSWORD);
    empBToken = await login(EMP_B_EMAIL, EMP_PASSWORD);

    // APPROVED run for APPROVED_PERIOD, DRAFT run left as DRAFT for DRAFT_PERIOD.
    // This suite asserts payslip self-service visibility, not the maker-checker
    // path, so the run is forced to APPROVED directly rather than going through
    // submit + a separate approver.
    const created = await request(app)
      .post('/api/v1/payroll/runs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ period: APPROVED_PERIOD });
    await db.payrollRun.update({
      where: { id: created.body.data.id },
      data: { status: 'APPROVED', approvedAt: new Date() },
    });

    await request(app)
      .post('/api/v1/payroll/runs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ period: DRAFT_PERIOD });
  });

  afterAll(async () => {
    await cleanup(tenantId);
  });

  const slipId = (employeeId: string, period: string) =>
    db.payslip
      .findFirst({ where: { tenantId, employeeId, payrollRun: { period } }, select: { id: true } })
      .then((p) => p!.id);

  const getMe = (token: string) =>
    request(app).get('/api/v1/payroll/payslips/me').set('Authorization', `Bearer ${token}`);
  const getOne = (id: string, token: string) =>
    request(app).get(`/api/v1/payroll/payslips/${id}`).set('Authorization', `Bearer ${token}`);

  it('lists only the employee’s own payslips from APPROVED/PAID runs', async () => {
    const res = await getMe(empAToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].employeeId).toBe(empAId);
    expect(res.body.data[0].period).toBe(APPROVED_PERIOD);
  });

  it('lets an employee read their own APPROVED payslip by id', async () => {
    const id = await slipId(empAId, APPROVED_PERIOD);
    const res = await getOne(id, empAToken);
    expect(res.status).toBe(200);
    expect(res.body.data.employeeId).toBe(empAId);
    expect(res.body.data.netPay).toBeDefined();
  });

  it('hides an employee’s own DRAFT payslip (404, not yet visible)', async () => {
    const id = await slipId(empAId, DRAFT_PERIOD);
    const res = await getOne(id, empAToken);
    expect(res.status).toBe(404);
  });

  it('forbids an employee from reading another employee’s payslip (403)', async () => {
    const id = await slipId(empBId, APPROVED_PERIOD);
    const res = await getOne(id, empAToken);
    expect(res.status).toBe(403);
  });

  it('lets HR (payroll:process) read any payslip, including DRAFT', async () => {
    const id = await slipId(empBId, DRAFT_PERIOD);
    const res = await getOne(id, hrToken);
    expect(res.status).toBe(200);
    expect(res.body.data.employeeId).toBe(empBId);
  });

  it('returns 404 for a non-existent payslip id', async () => {
    const res = await getOne('00000000-0000-0000-0000-000000000000', hrToken);
    expect(res.status).toBe(404);
  });

  it('forbids reading the salary roster without payroll:process (403)', async () => {
    const res = await request(app)
      .get('/api/v1/payroll/salaries')
      .set('Authorization', `Bearer ${empAToken}`);
    expect(res.status).toBe(403);
  });
});
