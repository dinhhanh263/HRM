/**
 * October 2026 payroll sample-data seed (local manual testing only).
 *
 * Unlike `seed-payroll` (which builds a small 4-person APPROVED May run), this
 * seed prepares the FULL roster so payroll can be computed for EVERY active
 * employee for 2026-10:
 *   1. an in-force EmployeeSalary (tiered by position level) for each employee,
 *   2. a full month of October attendance (every policy workday, 08:00–17:00),
 *   3. a freshly computed DRAFT run for 2026-10.
 *
 * The DRAFT is left un-approved on purpose, so the maker→checker flow
 * (submit → approve / reject) stays testable in the UI. createRun replaces an
 * existing DRAFT, so "create run for October" in the UI re-runs cleanly too.
 *
 * Goes through the SAME services the live UI uses (payrollSettingsService,
 * employeeSalaryService, payrollRunService) so seeded figures match the engine.
 *
 * Idempotent: wipes each active employee's salaries + October attendance and the
 * tenant's 2026-10 run before re-seeding. Safe to re-run.
 *
 * Prereq: run the base seed first (tenant, employees, timesheet policy, holidays).
 */
import { PrismaClient, AttendanceSource, EmployeeStatus } from '@prisma/client';
import { deriveOvertimeCategory, type HolidayMatch } from '../src/domain/timesheet/overtime.helper.js';
import { payrollSettingsService } from '../src/domain/services/payroll-settings.service.js';
import { employeeSalaryService } from '../src/domain/services/employee-salary.service.js';
import { payrollRunService } from '../src/domain/services/payroll-run.service.js';
import type { AllowanceItem } from '@hrm/shared';

const prisma = new PrismaClient();

const TENANT_SLUG = 'codecrush';
const PERIOD = '2026-10';
const SALARY_FROM = '2026-01-01'; // in force for the whole period
const OCT_START = new Date(Date.UTC(2026, 9, 1)); // 2026-10-01
const OCT_END = new Date(Date.UTC(2026, 10, 1)); // 2026-11-01 (exclusive)

/** UTC-midnight Date for a @db.Date work date. */
const day = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));
/** UTC timestamp for check-in/out (times are stored + displayed in UTC). */
const at = (y: number, m: number, d: number, hh: number, mm = 0): Date =>
  new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
const workedHours = (checkIn: Date, checkOut: Date): number =>
  Math.round(((checkOut.getTime() - checkIn.getTime()) / 3_600_000) * 100) / 100;

// Compensation tiered by position level (1–5). Whole-VND base + dependents +
// allowances chosen to spread employees across PIT brackets and exercise both
// taxable and non-taxable allowances in the payslip breakdown.
interface Tier {
  baseSalary: string;
  dependents: number;
  allowances: AllowanceItem[];
}
const LUNCH: AllowanceItem = { name: 'Phụ cấp ăn trưa', amount: 730_000, taxable: false };
const PHONE: AllowanceItem = { name: 'Phụ cấp điện thoại', amount: 300_000, taxable: false };
const resp = (amount: number): AllowanceItem => ({ name: 'Phụ cấp trách nhiệm', amount, taxable: true });

const TIER_BY_LEVEL: Record<number, Tier> = {
  1: { baseSalary: '12000000', dependents: 0, allowances: [LUNCH] },
  2: { baseSalary: '18000000', dependents: 0, allowances: [LUNCH] },
  3: { baseSalary: '25000000', dependents: 1, allowances: [LUNCH, PHONE] },
  4: { baseSalary: '38000000', dependents: 2, allowances: [LUNCH, PHONE, resp(4_000_000)] },
  5: { baseSalary: '50000000', dependents: 2, allowances: [LUNCH, PHONE, resp(6_000_000)] },
};
const DEFAULT_TIER: Tier = { baseSalary: '15000000', dependents: 0, allowances: [LUNCH] };
const tierFor = (level: number | undefined): Tier =>
  (level != null && TIER_BY_LEVEL[level]) || DEFAULT_TIER;

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`Tenant "${TENANT_SLUG}" not found — run the base seed first.`);

  const policy = await prisma.timesheetPolicy.findUnique({ where: { tenantId: tenant.id } });
  if (!policy) throw new Error('Timesheet policy not found — run the base seed first.');
  const workdays = policy.workdays;

  const holidayRows = await prisma.holiday.findMany({ where: { tenantId: tenant.id } });
  const holidays: HolidayMatch[] = holidayRows.map((h) => ({ date: h.date, recurring: h.recurring }));

  // Every payable employee: ACTIVE, with their position level for the salary tier.
  const employees = await prisma.employee.findMany({
    where: { tenantId: tenant.id, status: EmployeeStatus.ACTIVE },
    select: { id: true, employeeCode: true, fullName: true, position: { select: { level: true } } },
  });
  if (employees.length === 0) throw new Error('No active employees found — run the base seed first.');
  const employeeIds = employees.map((e) => e.id);

  // runById: prefer the founder (EMP-900), else admin (EMP-000), else first active.
  const byCode = async (code: string): Promise<string | null> => {
    const e = await prisma.employee.findFirst({
      where: { tenantId: tenant.id, employeeCode: code },
      select: { id: true },
    });
    return e?.id ?? null;
  };
  const runById = (await byCode('EMP-900')) ?? (await byCode('EMP-000')) ?? employeeIds[0];

  // ── Idempotency ──────────────────────────────────────────────────────────────
  await prisma.payrollRun.deleteMany({ where: { tenantId: tenant.id, period: PERIOD } });
  await prisma.attendanceRecord.deleteMany({
    where: { tenantId: tenant.id, employeeId: { in: employeeIds }, workDate: { gte: OCT_START, lt: OCT_END } },
  });
  await prisma.employeeSalary.deleteMany({ where: { tenantId: tenant.id, employeeId: { in: employeeIds } } });

  // ── Settings ───────────────────────────────────────────────────────────────
  // First read auto-seeds the VN statutory defaults (rates, brackets, deductions).
  await payrollSettingsService.getSettings(tenant.id);

  // ── Salaries + dependents ────────────────────────────────────────────────────
  for (const e of employees) {
    const tier = tierFor(e.position?.level);
    await prisma.employee.update({ where: { id: e.id }, data: { dependentsCount: tier.dependents } });
    await employeeSalaryService.create(
      tenant.id,
      {
        employeeId: e.id,
        baseSalary: tier.baseSalary,
        allowances: tier.allowances,
        effectiveFrom: SALARY_FROM,
        note: 'Mức lương khởi tạo (seed tháng 10)',
      },
      runById,
    );
  }

  // ── Attendance: full October, every policy workday 08:00→17:00 (skip holidays) ─
  const attendance: {
    tenantId: string;
    employeeId: string;
    workDate: Date;
    checkInAt: Date;
    checkOutAt: Date;
    workedHours: number;
    source: AttendanceSource;
  }[] = [];
  for (let d = 1; d <= 31; d++) {
    const wd = day(2026, 10, d);
    if (!workdays.includes(wd.getUTCDay())) continue; // weekend
    if (deriveOvertimeCategory(wd, workdays, holidays) === 'OT_HOLIDAY') continue; // holiday
    const checkIn = at(2026, 10, d, 8, 0);
    const checkOut = at(2026, 10, d, 17, 0);
    for (const id of employeeIds) {
      attendance.push({
        tenantId: tenant.id,
        employeeId: id,
        workDate: wd,
        checkInAt: checkIn,
        checkOutAt: checkOut,
        workedHours: workedHours(checkIn, checkOut),
        source: AttendanceSource.SELF,
      });
    }
  }
  await prisma.attendanceRecord.createMany({ data: attendance });

  // ── Compute the DRAFT run (left un-approved for maker-checker testing) ─────────
  const run = await payrollRunService.createRun(tenant.id, PERIOD, runById);

  console.log(
    `Seeded October payroll: ${employees.length} salaries, ${attendance.length} attendance records, ` +
      `and a DRAFT run ${PERIOD} with ${run.headcount} payslips ` +
      `(gross ${run.totalGross}, net ${run.totalNet}) for tenant "${TENANT_SLUG}".`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
