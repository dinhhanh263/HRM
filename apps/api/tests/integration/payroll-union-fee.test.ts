import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

// End-to-end guard for the *business outcome* of PayrollSettings.unionFeeRate
// (phí công đoàn): the fee is charged on the same capped insurance base as the
// statutory insurances, but it is a POST-tax deduction — it must reduce net pay
// only and NEVER the taxable income (correct per VN PIT law). This runs a real
// payroll through every layer (settings PATCH → POST /payroll/runs) and asserts:
//   1. unionFee == insuranceBase × unionFeeRate
//   2. taxableIncome is the pre-union-fee figure (gross − insurance − personal),
//      i.e. the fee did NOT shrink the tax base
//   3. netPay == gross − insurance − PIT − unionFee (the fee lands after tax)
//
// As with the dependents test, a payroll run with no attendance floors taxable
// income at 0 and hides everything, so we seed a full month of attendance first.

const TENANT_SLUG = 'payroll-union-test-tenant';
const HR_EMAIL = 'hr@payroll-union-test.com';
const HR_PASSWORD = 'HrUnion@123';
const PERIOD = '2026-01';

// Defaults (apps/api/src/domain/payroll/defaults.ts): insuranceBase BASE_SALARY,
// no cap, employee-side 8% + 1.5% + 1% = 10.5%; personalDeduction 11M. We raise
// only unionFeeRate to 1% and verify the fee is post-tax. With a 30M base and
// full attendance, 0 dependents:
//   grossPay        = 30,000,000
//   insuranceTotal  = 30,000,000 × 0.105            = 3,150,000
//   unionFee        = 30,000,000 × 0.01             =   300,000
//   taxableIncome   = 30M − 3.15M − 11M             = 15,850,000  (NO union fee term)
//   PIT (progressive on 15,850,000):
//     0–5M @5%      = 250,000
//     5–10M @10%    = 500,000
//     10–15.85M @15%= 877,500
//     total         = 1,627,500
//   netPay = 30M − 3.15M − 1,627,500 − 300,000      = 24,922,500
const BASE_SALARY = 30_000_000;
const UNION_FEE_RATE = 0.01;
const EXPECTED_INSURANCE_TOTAL = 3_150_000;
const EXPECTED_UNION_FEE = 300_000;
const EXPECTED_TAXABLE_INCOME = 15_850_000;
const EXPECTED_PIT = 1_627_500;
const EXPECTED_NET_PAY = 24_922_500;

async function cleanup(tenantId: string) {
  await db.payslip.deleteMany({ where: { tenantId } });
  await db.payrollRun.deleteMany({ where: { tenantId } });
  await db.payrollSettings.deleteMany({ where: { tenantId } });
  await db.attendanceRecord.deleteMany({ where: { tenantId } });
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

// Present every policy workday (Mon–Fri) so proratedBase === baseSalary.
async function seedFullMonthAttendance(tenantId: string, employeeId: string, period: string) {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7)); // 1-based
  const rows: { tenantId: string; employeeId: string; workDate: Date; workedHours: number }[] = [];
  for (let day = 1; day <= 31; day += 1) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() !== month - 1) break;
    const dow = date.getUTCDay();
    if (dow >= 1 && dow <= 5) {
      rows.push({ tenantId, employeeId, workDate: date, workedHours: 8 });
    }
  }
  await db.attendanceRecord.createMany({ data: rows, skipDuplicates: true });
}

describe('Payroll union fee → post-tax deduction (end-to-end)', () => {
  let tenantId: string;
  let hrToken: string;
  let employeeId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Payroll Union Fee Test Tenant', slug: TENANT_SLUG },
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

    const user = await db.user.create({
      data: {
        tenantId,
        email: 'emp@payroll-union-test.com',
        passwordHash: 'x',
        fullName: 'Employee UF',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      },
    });
    const employee = await db.employee.create({
      data: {
        tenantId,
        userId: user.id,
        employeeCode: 'UF1',
        fullName: 'Employee UF',
        joinDate: new Date('2023-01-01'),
        contractType: 'FULL_TIME',
        status: 'ACTIVE',
        dependentsCount: 0,
      },
    });
    employeeId = employee.id;
    await db.employeeSalary.create({
      data: {
        tenantId,
        employeeId: employee.id,
        baseSalary: BASE_SALARY,
        allowances: [],
        effectiveFrom: new Date('2025-01-01'),
      },
    });
    await seedFullMonthAttendance(tenantId, employee.id, PERIOD);

    hrToken = await login(HR_EMAIL, HR_PASSWORD, TENANT_SLUG);

    // Turn on the union fee at the company level (requires payroll:process).
    const patch = await request(app)
      .patch('/api/v1/payroll/settings')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ unionFeeRate: UNION_FEE_RATE });
    expect(patch.status).toBe(200);
    expect(patch.body.data.unionFeeRate).toBe(UNION_FEE_RATE);
  });

  afterAll(async () => {
    await cleanup(tenantId);
  });

  it('charges the fee on the insurance base, deducts it post-tax (net only)', async () => {
    const res = await request(app)
      .post('/api/v1/payroll/runs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ period: PERIOD });

    expect(res.status).toBe(201);
    expect(res.body.data.payslips).toHaveLength(1);

    const slip = res.body.data.payslips[0];

    // Attendance seeding worked → full base is paid, taxable income is positive.
    expect(slip.proratedBase).toBe(String(BASE_SALARY));
    expect(slip.insuranceTotal).toBe(String(EXPECTED_INSURANCE_TOTAL));

    // 1. The fee is charged on the insurance base.
    expect(slip.unionFee).toBe(String(EXPECTED_UNION_FEE));

    // 2. POST-tax: the tax base excludes the union fee. taxableIncome equals
    //    gross − insurance − personalDeduction, with NO union fee subtracted.
    expect(slip.taxableIncome).toBe(String(EXPECTED_TAXABLE_INCOME));
    expect(slip.personalIncomeTax).toBe(String(EXPECTED_PIT));

    // 3. The fee lands after tax: net pay drops by exactly the union fee.
    expect(slip.netPay).toBe(String(EXPECTED_NET_PAY));
    expect(Number(slip.grossPay) - Number(slip.insuranceTotal) - Number(slip.personalIncomeTax) - Number(slip.unionFee)).toBe(
      Number(slip.netPay),
    );
  });
});
