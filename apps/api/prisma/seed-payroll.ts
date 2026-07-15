/**
 * Payroll sample-data seed (local manual testing only).
 *
 * Gives every payroll surface something realistic to show: HR runs list +
 * drill-in, per-employee payslip breakdown, PDF export, and the EMPLOYEE
 * self-service payslip view. Builds an APPROVED 2026-05 run with positive net
 * pay for the four employees that already have full May attendance from
 * seed-timesheet (EMP-900, EMP-002, EMP-003, EMP-004).
 *
 * Goes through the SAME services the live UI uses — payrollSettingsService,
 * employeeSalaryService, payrollRunService — so seeded figures match exactly
 * what the engine computes in production. Nothing about rates/brackets is
 * hardcoded here; settings come from the auto-seeded tenant defaults.
 *
 * Idempotent: clears the tenant's 2026-05 run and ALL of its employee salaries
 * before re-seeding, so the payable roster is exactly the four with attendance
 * (no zero-attendance employees dragging net pay negative) and re-runs are safe.
 *
 * Prereq: run the base seed AND `db:seed:timesheet` first — this seed throws if
 * the tenant, employees, or their May attendance summaries are missing.
 */
import { PrismaClient } from '@prisma/client';
import { payrollSettingsService } from '../src/domain/services/payroll-settings.service.js';
import { employeeSalaryService } from '../src/domain/services/employee-salary.service.js';
import { payrollRunService } from '../src/domain/services/payroll-run.service.js';
import type { AllowanceItem } from '@hrm/shared';

const prisma = new PrismaClient();

const TENANT_SLUG = 'codecrush';
const PERIOD = '2026-05'; // a full past month with seeded attendance
const SALARY_FROM = '2026-01-01'; // in force for the whole period

interface SalarySpec {
  code: string;
  baseSalary: string; // whole-VND string
  dependents: number;
  allowances: AllowanceItem[];
}

// Varied compensation so the payslip breakdown shows taxable vs non-taxable
// allowances, dependent deductions, and a spread of PIT brackets.
const SALARY_SPECS: SalarySpec[] = [
  {
    code: 'EMP-900', // Đinh Văn Hạnh — founder / tech lead
    baseSalary: '40000000',
    dependents: 2,
    allowances: [
      { name: 'Phụ cấp trách nhiệm', amount: 5_000_000, taxable: true },
      { name: 'Phụ cấp ăn trưa', amount: 730_000, taxable: false },
    ],
  },
  {
    code: 'EMP-002', // Lê Văn Tuấn — manager
    baseSalary: '35000000',
    dependents: 1,
    allowances: [
      { name: 'Phụ cấp trách nhiệm', amount: 4_000_000, taxable: true },
      { name: 'Phụ cấp ăn trưa', amount: 730_000, taxable: false },
      { name: 'Phụ cấp điện thoại', amount: 300_000, taxable: false },
    ],
  },
  {
    code: 'EMP-003', // Phạm Thùy Linh — senior engineer
    baseSalary: '22000000',
    dependents: 0,
    allowances: [
      { name: 'Phụ cấp ăn trưa', amount: 730_000, taxable: false },
      { name: 'Phụ cấp xăng xe', amount: 500_000, taxable: false },
    ],
  },
  {
    code: 'EMP-004', // Nguyễn Minh Đức — software engineer
    baseSalary: '16000000',
    dependents: 0,
    allowances: [{ name: 'Phụ cấp ăn trưa', amount: 730_000, taxable: false }],
  },
];

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`Tenant "${TENANT_SLUG}" not found — run the base seed first.`);

  const byCode = async (code: string): Promise<string> => {
    const emp = await prisma.employee.findFirst({
      where: { tenantId: tenant.id, employeeCode: code },
      select: { id: true },
    });
    if (!emp) throw new Error(`Employee ${code} not found — run the base seed first.`);
    return emp.id;
  };

  const hr = await byCode('EMP-001'); // approver
  const founder = await byCode('EMP-900'); // runs the payroll

  // ── Idempotency ──────────────────────────────────────────────────────────────
  // Drop the period's run (an APPROVED run is locked against the service, so
  // delete directly; payslips cascade) and wipe all salaries so the payable
  // roster is exactly the four employees we set below.
  await prisma.payrollRun.deleteMany({ where: { tenantId: tenant.id, period: PERIOD } });
  await prisma.employeeSalary.deleteMany({ where: { tenantId: tenant.id } });

  // ── Settings ───────────────────────────────────────────────────────────────
  // First read auto-seeds the VN statutory defaults (rates, brackets, deductions).
  await payrollSettingsService.getSettings(tenant.id);

  // ── Salaries + dependents ────────────────────────────────────────────────────
  for (const spec of SALARY_SPECS) {
    const employeeId = await byCode(spec.code);
    await prisma.employee.update({
      where: { id: employeeId },
      data: { dependentsCount: spec.dependents },
    });
    await employeeSalaryService.create(
      tenant.id,
      {
        employeeId,
        baseSalary: spec.baseSalary,
        allowances: spec.allowances,
        effectiveFrom: SALARY_FROM,
        note: 'Mức lương khởi tạo (seed)',
      },
      hr,
    );
  }

  // ── Run → approve ──────────────────────────────────────────────────────────
  // createRun resolves the payable roster, pulls each frozen May attendance
  // summary, runs the engine, and persists a payslip line per employee. approve
  // freezes the settings snapshot and locks the run.
  const draft = await payrollRunService.createRun(tenant.id, PERIOD, founder);
  await payrollRunService.submit(tenant.id, draft.id, founder);
  const run = await payrollRunService.approve(tenant.id, draft.id, hr);

  console.log(
    `Seeded payroll: APPROVED run ${PERIOD} with ${run.headcount} payslips for tenant "${TENANT_SLUG}".`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
