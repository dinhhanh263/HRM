import type { ApproverType, ApprovalDecision } from './leave';

// Overtime category derived server-side from the work date vs the tenant's
// timesheet policy (workdays) and holiday calendar. A holiday overrides
// weekend/weekday classification.
export const OvertimeCategory = {
  OT_WEEKDAY: 'OT_WEEKDAY',
  OT_WEEKEND: 'OT_WEEKEND',
  OT_HOLIDAY: 'OT_HOLIDAY',
} as const;

export type OvertimeCategory = (typeof OvertimeCategory)[keyof typeof OvertimeCategory];

export const OvertimeStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED', // legacy: chỉ còn cho dữ liệu cũ; luồng mới dùng RETURNED
  CANCELLED: 'CANCELLED',
  RETURNED: 'RETURNED', // bị trả về để NV sửa rồi nộp lại (round+1)
} as const;

export type OvertimeStatus = (typeof OvertimeStatus)[keyof typeof OvertimeStatus];

// SELF = recorded by the employee via check-in/out; MANUAL_ADJUST = created or
// corrected by a reviewer (HR/Manager), always audit-stamped with adjustedById.
export const AttendanceSource = {
  SELF: 'SELF',
  MANUAL_ADJUST: 'MANUAL_ADJUST',
} as const;

export type AttendanceSource = (typeof AttendanceSource)[keyof typeof AttendanceSource];

// ── Timesheet policy (per-tenant config) ───────────────────────────────────

export interface TimesheetPolicyDto {
  id: string;
  tenantId: string;
  // 0=Sunday .. 6=Saturday (JS getDay convention). Default Mon–Fri = [1,2,3,4,5].
  workdays: number[];
  standardHoursPerDay: number;
  nightStart: string; // "HH:mm"
  nightEnd: string; // "HH:mm"
  otWeekday: number;
  otWeekend: number;
  otHoliday: number;
  nightExtra: number;
  nightOtExtra: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateTimesheetPolicyRequest {
  workdays?: number[];
  standardHoursPerDay?: number;
  nightStart?: string;
  nightEnd?: string;
  otWeekday?: number;
  otWeekend?: number;
  otHoliday?: number;
  nightExtra?: number;
  nightOtExtra?: number;
}

// ── Holiday calendar ────────────────────────────────────────────────────────

export interface HolidayDto {
  id: string;
  tenantId: string;
  date: string; // ISO date (YYYY-MM-DD)
  name: string;
  recurring: boolean; // fixed-date annual holiday (e.g. 30/4, 1/5, 2/9)
  createdAt: string;
  updatedAt: string;
}

export interface CreateHolidayRequest {
  date: string;
  name: string;
  recurring?: boolean;
}

export interface UpdateHolidayRequest {
  date?: string;
  name?: string;
  recurring?: boolean;
}

export interface HolidayListQuery {
  year?: number;
}

export interface SeedHolidaysRequest {
  year: number;
}

export interface SeedHolidaysResult {
  year: number;
  seeded: number;
  // false when the seeded year has no lunar-holiday data (Tết, Giỗ Tổ), so only
  // the solar-fixed holidays were written — the UI must warn that Tết is missing.
  lunarCovered: boolean;
}

// ── Attendance ──────────────────────────────────────────────────────────────

export interface AttendanceEmployeeDto {
  id: string;
  fullName: string;
  employeeCode: string;
  avatar: string | null;
  departmentName: string | null;
}

export interface AttendanceRecordDto {
  id: string;
  tenantId: string;
  employeeId: string;
  workDate: string; // ISO date (YYYY-MM-DD)
  checkInAt: string | null;
  checkOutAt: string | null;
  note: string | null;
  workedHours: number | null;
  source: AttendanceSource;
  adjustedById: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: AttendanceEmployeeDto | null;
  adjustedBy?: Pick<AttendanceEmployeeDto, 'id' | 'fullName'> | null;
}

export interface CheckInRequest {
  note?: string;
  // Optional client clock for the work date; server validates (no future date).
  workDate?: string;
}

export interface CheckOutRequest {
  note?: string;
}

// Reviewer create/correct a member's record (audited).
export interface AdjustAttendanceRequest {
  employeeId: string;
  workDate: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  note?: string;
}

export interface AttendanceListQuery {
  // 'mine' = own records; 'team' = direct reports (manager); 'all' = tenant (HR).
  scope?: 'mine' | 'team' | 'all';
  employeeId?: string;
  month?: string; // YYYY-MM
  departmentId?: string;
}

// ── Overtime ──────────────────────────────────────────────────────────────

// Một mục trên timeline phê duyệt của một đơn OT (song song với LeaveApprovalDto).
export interface OvertimeApprovalDto {
  id: string;
  round: number; // tăng mỗi lần đơn bị trả về rồi nộp lại
  stepOrder: number;
  approverType: ApproverType;
  roleKey: string | null;
  approverId: string | null; // người duyệt kỳ vọng (đã resolve); null nếu không xác định được
  decision: ApprovalDecision | null; // null = đang chờ
  decidedById: string | null;
  decidedAt: string | null;
  note: string | null;
  createdAt: string;
  decidedBy?: Pick<AttendanceEmployeeDto, 'id' | 'fullName'> | null;
}

export interface OvertimeRequestDto {
  id: string;
  tenantId: string;
  employeeId: string;
  workDate: string; // ISO date (YYYY-MM-DD)
  hours: number;
  night: boolean;
  category: OvertimeCategory;
  reason: string | null;
  status: OvertimeStatus;
  flowId: string | null; // null = luồng legacy single-step
  currentStep: number; // 1-based step đang chờ; 0 = legacy/đã kết thúc
  multiplier: number | null; // snapshotted effective multiplier at approval
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: AttendanceEmployeeDto | null;
  reviewedBy?: Pick<AttendanceEmployeeDto, 'id' | 'fullName'> | null;
  approvals?: OvertimeApprovalDto[]; // timeline phê duyệt (khi đơn dùng luồng cấu hình)
}

export interface CreateOvertimeRequest {
  workDate: string;
  hours: number;
  night?: boolean;
  reason?: string;
}

export interface RejectOvertimeRequest {
  note: string;
}

// Advisory BLLĐ ceilings surfaced at approval (Điều 107: ≤40h/month, ≤200h/year).
// These never block approval — they inform the reviewer.
export interface OvertimeCapWarning {
  scope: 'month' | 'year';
  limit: number; // the legal ceiling in hours
  total: number; // approved OT hours in the period including this request
}

// Returned by approve so the client can snapshot the multiplier and surface any
// cap warnings to the reviewer.
export interface OvertimeReviewResultDto {
  overtime: OvertimeRequestDto;
  warnings: OvertimeCapWarning[];
}

export interface OvertimeListQuery {
  page?: number;
  limit?: number;
  scope?: 'mine' | 'team' | 'all';
  status?: OvertimeStatus;
  month?: string; // YYYY-MM
  departmentId?: string;
}

// ── Timesheet summary (the Payroll contract — STABLE, do not break) ─────────
// Deterministic, side-effect-free per-employee/month aggregation that Payroll
// consumes. Changing this shape requires "Ask First" once Payroll depends on it.

export interface TimesheetSummaryOvertimeDto {
  category: OvertimeCategory;
  night: boolean;
  hours: number;
  multiplier: number; // snapshot from the approved request
}

export interface TimesheetSummaryDto {
  employeeId: string;
  month: string; // YYYY-MM
  workingDaysInPeriod: number; // policy workdays in month, excluding holidays
  daysPresent: number;
  daysAbsent: number; // workdays with no attendance and no leave
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  holidayCount: number;
  totalWorkedHours: number;
  overtime: TimesheetSummaryOvertimeDto[]; // APPROVED OT only, grouped
}

export interface TimesheetSummaryQuery {
  employeeId?: string; // reviewer may pass another employee in scope
  month: string; // YYYY-MM
}
