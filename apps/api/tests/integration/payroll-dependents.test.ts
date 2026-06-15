import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/client.js';
import { hashPassword } from '../../src/shared/helpers/hash.helper.js';
import {
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../../src/domain/rbac/catalog.js';

// End-to-end guard for the *business outcome* of Employee.dependentsCount: a real
// employee with dependents must pay LESS personal income tax, because the engine
// subtracts `dependentDeduction × dependents` from taxable income. Earlier tests
// only proved the value persisted (CRUD) and that the wiring compiled — none ran
// a payroll through every layer and asserted the tax actually drops. This test
// closes that gap: two employees identical in every way *except* dependents, run
// through the live POST /payroll/runs, and we assert the deduction lands.
//
// Critical seeding detail: a payroll run with no attendance classifies every
// policy workday as `daysAbsent` → proratedBase 0 → grossPay 0 → taxableIncome
// floored at 0 for everyone, which hides any dependent effect. So we MUST seed a
// full month of attendance to make taxable income positive before the deduction
// is observable.

const TENANT_SLUG = 'payroll-dep-test-tenant';
const HR_EMAIL = 'hr@payroll-dep-test.com';
const HR_PASSWORD = 'HrDep@123';
const PERIOD = '2026-01';

// Defaults (apps/api/src/domain/payroll/defaults.ts): insuranceBase BASE_SALARY,
// no cap, employee-side 8% + 1.5% + 1% = 10.5%; personalDeduction 11M;
// dependentDeduction 4.4M. With a 50M base and full attendance:
//   grossPay        = 50,000,000
//   insuranceTotal  = 50,000,000 × 0.105 = 5,250,000
//   taxableIncome(0 deps) = 50M − 5.25M − 11M             = 33,750,000
//   taxableIncome(2 deps) = 33,750,000 − 2 × 4,400,000    = 24,950,000
// Both positive, so the full 8.8M deduction is observable (not floored).
const BASE_SALARY = 50_000_000;
const DEPENDENT_DEDUCTION = 4_400_000;

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

// Seed an AttendanceRecord for every policy workday (Mon–Fri) of the period so
// the employee is present every working day → proratedBase === baseSalary.
async function seedFullMonthAttendance(tenantId: string, employeeId: string, period: string) {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7)); // 1-based
  const rows: { tenantId: string; employeeId: string; workDate: Date; workedHours: number }[] = [];
  for (let day = 1; day <= 31; day += 1) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() !== month - 1) break; // rolled into next month
    const dow = date.getUTCDay(); // 0=Sun..6=Sat
    if (dow >= 1 && dow <= 5) {
      rows.push({ tenantId, employeeId, workDate: date, workedHours: 8 });
    }
  }
  await db.attendanceRecord.createMany({ data: rows, skipDuplicates: true });
}

describe('Payroll dependents → PIT deduction (end-to-end)', () => {
  let tenantId: string;
  let hrToken: string;
  let depZeroId: string;
  let depTwoId: string;

  beforeAll(async () => {
    const tenant = await db.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: { name: 'Payroll Dependents Test Tenant', slug: TENANT_SLUG },
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

    // Two ACTIVE employees that are byte-for-byte identical except dependentsCount.
    const makeEmployee = async (code: string, dependentsCount: number) => {
      const user = await db.user.create({
        data: {
          tenantId,
          email: `${code.toLowerCase()}@payroll-dep-test.com`,
          passwordHash: 'x',
          fullName: `Employee ${code}`,
          role: 'EMPLOYEE',
          status: 'ACTIVE',
        },
      });
      const employee = await db.employee.create({
        data: {
          tenantId,
          userId: user.id,
          employeeCode: code,
          fullName: `Employee ${code}`,
          joinDate: new Date('2023-01-01'),
          contractType: 'FULL_TIME',
          status: 'ACTIVE',
          dependentsCount,
        },
      });
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
      return employee.id;
    };

    depZeroId = await makeEmployee('DEP0', 0);
    depTwoId = await makeEmployee('DEP2', 2);

    hrToken = await login(HR_EMAIL, HR_PASSWORD, TENANT_SLUG);
  });

  afterAll(async () => {
    await cleanup(tenantId);
  });

  it('subtracts dependentDeduction × dependents from taxable income and lowers PIT', async () => {
    const res = await request(app)
      .post('/api/v1/payroll/runs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ period: PERIOD });

    expect(res.status).toBe(201);
    expect(res.body.data.payslips).toHaveLength(2);

    const slipOf = (employeeId: string) =>
      res.body.data.payslips.find((p: { employeeId: string }) => p.employeeId === employeeId);
    const zero = slipOf(depZeroId);
    const two = slipOf(depTwoId);
    expect(zero).toBeDefined();
    expect(two).toBeDefined();

    // Attendance seeding worked: both are paid the full base (so taxable income
    // is positive and the dependent deduction is actually observable).
    expect(zero.proratedBase).toBe(String(BASE_SALARY));
    expect(two.proratedBase).toBe(String(BASE_SALARY));
    expect(zero.dependents).toBe(0);
    expect(two.dependents).toBe(2);

    const tiZero = Number(zero.taxableIncome);
    const tiTwo = Number(two.taxableIncome);

    // Core invariant: dependents reduce taxable income by exactly the per-dependent
    // deduction × count — nothing else differs between the two employees.
    expect(tiTwo).toBeGreaterThan(0); // not floored: the deduction is genuinely applied
    expect(tiZero - tiTwo).toBe(2 * DEPENDENT_DEDUCTION);

    // And a lower taxable income must produce a strictly lower income tax.
    expect(Number(two.personalIncomeTax)).toBeLessThan(Number(zero.personalIncomeTax));
  });
});
