/**
 * Timesheet sample-data seed (local manual testing only).
 *
 * Populates attendance + overtime for four target employees so every timesheet
 * surface has something to show: self calendar/list/summary, the OT panel across
 * all categories × statuses × day/night, and the reviewer team views.
 *
 * Idempotent: clears the four employees' attendance_records + overtime_requests
 * in [2026-05-01, 2026-07-01) before inserting, so it can be re-run freely.
 *
 * OT category + multiplier are derived with the SAME server helpers
 * (overtime.helper.ts) the live approval path uses, so seeded snapshots match
 * exactly what payroll will consume.
 */
import {
  PrismaClient,
  AttendanceSource,
  OvertimeStatus,
  type OvertimeCategory,
} from '@prisma/client';
import {
  deriveOvertimeCategory,
  computeOvertimeMultiplier,
  type HolidayMatch,
  type OvertimeMultiplierPolicy,
} from '../src/domain/timesheet/overtime.helper.js';

const prisma = new PrismaClient();

const TENANT_SLUG = 'codecrush';
const RANGE_START = new Date(Date.UTC(2026, 4, 1)); // 2026-05-01
const RANGE_END = new Date(Date.UTC(2026, 6, 1)); // 2026-07-01 (exclusive)

/** UTC-midnight Date for a @db.Date work date. */
const day = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));
/** UTC timestamp for check-in/out (times are stored + displayed in UTC). */
const at = (y: number, m: number, d: number, hh: number, mm = 0): Date =>
  new Date(Date.UTC(y, m - 1, d, hh, mm, 0));

const workedHours = (checkIn: Date, checkOut: Date): number =>
  Math.round(((checkOut.getTime() - checkIn.getTime()) / 3_600_000) * 100) / 100;

interface OtSpec {
  employeeId: string;
  workDate: Date;
  hours: number;
  night: boolean;
  status: OvertimeStatus;
  reviewerId: string | null;
  reason: string;
  reviewNote?: string;
}

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`Tenant "${TENANT_SLUG}" not found — run the base seed first.`);

  const policyRow = await prisma.timesheetPolicy.findUnique({ where: { tenantId: tenant.id } });
  if (!policyRow) throw new Error('Timesheet policy not found — run the base seed first.');

  const workdays = policyRow.workdays;
  const policy: OvertimeMultiplierPolicy = {
    otWeekday: policyRow.otWeekday,
    otWeekend: policyRow.otWeekend,
    otHoliday: policyRow.otHoliday,
    nightExtra: policyRow.nightExtra,
    nightOtExtra: policyRow.nightOtExtra,
  };

  const holidayRows = await prisma.holiday.findMany({ where: { tenantId: tenant.id } });
  const holidays: HolidayMatch[] = holidayRows.map((h) => ({ date: h.date, recurring: h.recurring }));

  const byCode = async (code: string): Promise<string> => {
    const emp = await prisma.employee.findFirst({
      where: { tenantId: tenant.id, employeeCode: code },
      select: { id: true },
    });
    if (!emp) throw new Error(`Employee ${code} not found — run the base seed first.`);
    return emp.id;
  };

  const hanh = await byCode('EMP-900'); // SUPER_ADMIN founder
  const tuan = await byCode('EMP-002'); // MANAGER (manages linh + duc)
  const hr = await byCode('EMP-001'); // HR (reviews tuan + hanh)
  const linh = await byCode('EMP-003'); // reports to tuan
  const duc = await byCode('EMP-004'); // reports to tuan

  const targets = [hanh, tuan, linh, duc];

  // ── Idempotency: clear the four employees' rows in the seeded range ──────────
  await prisma.overtimeRequest.deleteMany({
    where: {
      tenantId: tenant.id,
      employeeId: { in: targets },
      workDate: { gte: RANGE_START, lt: RANGE_END },
    },
  });
  await prisma.attendanceRecord.deleteMany({
    where: {
      tenantId: tenant.id,
      employeeId: { in: targets },
      workDate: { gte: RANGE_START, lt: RANGE_END },
    },
  });

  // ── Attendance ───────────────────────────────────────────────────────────────
  // Standard office day stored in UTC: 08:00 → 17:00 (= 9h worked, no lunch
  // deduction — exactly what the live check-in/out path computes).
  const attendance: {
    tenantId: string;
    employeeId: string;
    workDate: Date;
    checkInAt: Date;
    checkOutAt: Date;
    workedHours: number;
    source: AttendanceSource;
    adjustedById?: string;
    note?: string;
  }[] = [];

  // Per-employee quirks keyed by "M-D" so the calendar/list look lived-in.
  const linhAbsence = new Set(['5-14']); // a missed weekday (no record)
  const linhEarlyLeave = new Set(['5-21']); // left at 14:00
  const tuanLate = new Set(['5-7', '5-19']); // checked in 09:15
  const ducAdjusted = new Set(['5-12']); // forgot checkout → manager corrected

  const pushMonth = (year: number, month: number, lastDay: number): void => {
    for (let d = 1; d <= lastDay; d++) {
      const wd = day(year, month, d);
      if (!workdays.includes(wd.getUTCDay())) continue; // weekend
      const category = deriveOvertimeCategory(wd, workdays, holidays);
      if (category === 'OT_HOLIDAY') continue; // holiday — no regular attendance
      const key = `${month}-${d}`;

      for (const employeeId of targets) {
        // linh's absence: skip the record entirely.
        if (employeeId === linh && linhAbsence.has(key)) continue;

        let checkIn = at(year, month, d, 8, 0);
        let checkOut = at(year, month, d, 17, 0);
        let source: AttendanceSource = AttendanceSource.SELF;
        let adjustedById: string | undefined;
        let note: string | undefined;

        if (employeeId === tuan && tuanLate.has(key)) {
          checkIn = at(year, month, d, 9, 15);
          note = 'Đi muộn do kẹt xe';
        }
        if (employeeId === linh && linhEarlyLeave.has(key)) {
          checkOut = at(year, month, d, 14, 0);
          note = 'Về sớm việc gia đình';
        }
        if (employeeId === duc && ducAdjusted.has(key)) {
          // Quên check-out — quản lý (Lê Văn Tuấn) chỉnh sửa, audited.
          source = AttendanceSource.MANUAL_ADJUST;
          adjustedById = tuan;
          note = 'NV quên check-out, QL bổ sung giờ ra';
        }

        attendance.push({
          tenantId: tenant.id,
          employeeId,
          workDate: wd,
          checkInAt: checkIn,
          checkOutAt: checkOut,
          workedHours: workedHours(checkIn, checkOut),
          source,
          adjustedById,
          note,
        });
      }
    }
  };

  pushMonth(2026, 5, 31); // May — full past month
  pushMonth(2026, 6, 2); // June — only Jun 1–2 (today = 2026-06-02)

  await prisma.attendanceRecord.createMany({ data: attendance });

  // ── Overtime ─────────────────────────────────────────────────────────────────
  // Covers every category × day/night for APPROVED (snapshotted multiplier),
  // plus REJECTED + CANCELLED, plus PENDING in June for reviewers to act on.
  const otSpecs: OtSpec[] = [
    // APPROVED — weekday day → ×1.5
    { employeeId: linh, workDate: day(2026, 5, 6), hours: 2, night: false, status: OvertimeStatus.APPROVED, reviewerId: tuan, reason: 'Hoàn thành sprint release' },
    // APPROVED — weekday night → ×2.0
    { employeeId: linh, workDate: day(2026, 5, 13), hours: 3, night: true, status: OvertimeStatus.APPROVED, reviewerId: tuan, reason: 'Trực hệ thống ban đêm' },
    // APPROVED — weekend day → ×2.0
    { employeeId: duc, workDate: day(2026, 5, 9), hours: 4, night: false, status: OvertimeStatus.APPROVED, reviewerId: tuan, reason: 'Xử lý sự cố cuối tuần' },
    // APPROVED — weekend night → ×2.7
    { employeeId: duc, workDate: day(2026, 5, 16), hours: 3, night: true, status: OvertimeStatus.APPROVED, reviewerId: tuan, reason: 'Bảo trì hạ tầng đêm cuối tuần' },
    // APPROVED — holiday day → ×3.0 (1/5 Quốc tế Lao động)
    { employeeId: tuan, workDate: day(2026, 5, 1), hours: 5, night: false, status: OvertimeStatus.APPROVED, reviewerId: hr, reason: 'Hỗ trợ khách hàng dịp lễ' },
    // APPROVED — holiday night → ×3.9
    { employeeId: hanh, workDate: day(2026, 5, 1), hours: 2, night: true, status: OvertimeStatus.APPROVED, reviewerId: hr, reason: 'Giám sát hệ thống đêm lễ' },
    // REJECTED
    { employeeId: linh, workDate: day(2026, 5, 20), hours: 2, night: false, status: OvertimeStatus.REJECTED, reviewerId: tuan, reason: 'Làm thêm dọn dẹp code', reviewNote: 'Công việc này trong giờ hành chính, không tính OT' },
    // CANCELLED (rút bởi nhân viên trước khi duyệt)
    { employeeId: duc, workDate: day(2026, 5, 22), hours: 1.5, night: false, status: OvertimeStatus.CANCELLED, reviewerId: null, reason: 'Đăng nhầm ngày' },

    // PENDING — June, chờ reviewer xử lý
    { employeeId: linh, workDate: day(2026, 6, 1), hours: 2.5, night: false, status: OvertimeStatus.PENDING, reviewerId: null, reason: 'Chuẩn bị demo cho khách' },
    { employeeId: duc, workDate: day(2026, 6, 2), hours: 3, night: true, status: OvertimeStatus.PENDING, reviewerId: null, reason: 'Migrate dữ liệu ngoài giờ' },
    { employeeId: tuan, workDate: day(2026, 6, 1), hours: 2, night: false, status: OvertimeStatus.PENDING, reviewerId: null, reason: 'Họp planning kéo dài' },
  ];

  const now = new Date();
  const otData = otSpecs.map((s) => {
    const category: OvertimeCategory = deriveOvertimeCategory(
      s.workDate,
      workdays,
      holidays,
    ) as OvertimeCategory;
    const approved = s.status === OvertimeStatus.APPROVED;
    const reviewed =
      s.status === OvertimeStatus.APPROVED || s.status === OvertimeStatus.REJECTED;
    return {
      tenantId: tenant.id,
      employeeId: s.employeeId,
      workDate: s.workDate,
      hours: s.hours,
      night: s.night,
      category,
      reason: s.reason,
      status: s.status,
      // Snapshot the multiplier only at approval (immutable for payroll).
      multiplier: approved ? computeOvertimeMultiplier(category, s.night, policy) : null,
      reviewedById: reviewed ? s.reviewerId : null,
      reviewedAt: reviewed ? now : null,
      reviewNote: s.reviewNote ?? null,
    };
  });

  await prisma.overtimeRequest.createMany({ data: otData });

  console.log(
    `Seeded timesheet sample data: ${attendance.length} attendance records, ${otData.length} overtime requests for 4 employees (May–Jun 2026).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
