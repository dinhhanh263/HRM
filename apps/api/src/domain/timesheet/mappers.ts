import type {
  TimesheetPolicy,
  Holiday,
  AttendanceRecord,
  OvertimeRequest,
  Prisma,
} from '@prisma/client';
import type {
  TimesheetPolicyDto,
  HolidayDto,
  AttendanceRecordDto,
  OvertimeRequestDto,
  OvertimeApprovalDto,
} from '@hrm/shared';

type OvertimeApprovalRow = Prisma.OvertimeApprovalGetPayload<{
  include: { decidedBy: { select: { id: true; fullName: true } } };
}>;

export function toOvertimeApprovalDto(a: OvertimeApprovalRow): OvertimeApprovalDto {
  return {
    id: a.id,
    round: a.round,
    stepOrder: a.stepOrder,
    approverType: a.approverType,
    roleKey: a.roleKey,
    approverId: a.approverId,
    decision: a.decision,
    decidedById: a.decidedById,
    decidedAt: a.decidedAt ? a.decidedAt.toISOString() : null,
    note: a.note,
    createdAt: a.createdAt.toISOString(),
    decidedBy: a.decidedBy,
  };
}

// Employee identity selected for reviewer-facing views (attendance + overtime).
type EmployeeRow = {
  id: string;
  fullName: string;
  employeeCode: string;
  avatar: string | null;
  department: { name: string } | null;
} | null;

// AttendanceRecord optionally hydrated with the employee+adjuster relations
// selected by `attendanceWithEmployee` in the repository.
type AttendanceRecordRow = AttendanceRecord & {
  employee?: EmployeeRow;
  adjustedBy?: { id: string; fullName: string } | null;
};

// OvertimeRequest optionally hydrated with employee+reviewer relations selected
// by `overtimeWithEmployee` in the repository.
type OvertimeRequestRow = OvertimeRequest & {
  employee?: EmployeeRow;
  reviewedBy?: { id: string; fullName: string } | null;
  approvals?: OvertimeApprovalRow[];
};

export function toTimesheetPolicyDto(p: TimesheetPolicy): TimesheetPolicyDto {
  return {
    id: p.id,
    tenantId: p.tenantId,
    workdays: p.workdays,
    standardHoursPerDay: p.standardHoursPerDay,
    nightStart: p.nightStart,
    nightEnd: p.nightEnd,
    otWeekday: p.otWeekday,
    otWeekend: p.otWeekend,
    otHoliday: p.otHoliday,
    nightExtra: p.nightExtra,
    nightOtExtra: p.nightOtExtra,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toHolidayDto(h: Holiday): HolidayDto {
  return {
    id: h.id,
    tenantId: h.tenantId,
    date: h.date.toISOString().slice(0, 10),
    name: h.name,
    recurring: h.recurring,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
  };
}

export function toAttendanceRecordDto(r: AttendanceRecordRow): AttendanceRecordDto {
  return {
    id: r.id,
    tenantId: r.tenantId,
    employeeId: r.employeeId,
    workDate: r.workDate.toISOString().slice(0, 10),
    checkInAt: r.checkInAt ? r.checkInAt.toISOString() : null,
    checkOutAt: r.checkOutAt ? r.checkOutAt.toISOString() : null,
    note: r.note,
    workedHours: r.workedHours,
    source: r.source,
    adjustedById: r.adjustedById,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    employee: r.employee
      ? {
          id: r.employee.id,
          fullName: r.employee.fullName,
          employeeCode: r.employee.employeeCode,
          avatar: r.employee.avatar,
          departmentName: r.employee.department?.name ?? null,
        }
      : undefined,
    adjustedBy: r.adjustedBy ? { id: r.adjustedBy.id, fullName: r.adjustedBy.fullName } : null,
  };
}

export function toOvertimeRequestDto(r: OvertimeRequestRow): OvertimeRequestDto {
  return {
    id: r.id,
    tenantId: r.tenantId,
    employeeId: r.employeeId,
    workDate: r.workDate.toISOString().slice(0, 10),
    hours: r.hours,
    night: r.night,
    category: r.category,
    reason: r.reason,
    status: r.status,
    flowId: r.flowId,
    currentStep: r.currentStep,
    multiplier: r.multiplier,
    reviewedById: r.reviewedById,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    reviewNote: r.reviewNote,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    employee: r.employee
      ? {
          id: r.employee.id,
          fullName: r.employee.fullName,
          employeeCode: r.employee.employeeCode,
          avatar: r.employee.avatar,
          departmentName: r.employee.department?.name ?? null,
        }
      : undefined,
    reviewedBy: r.reviewedBy ? { id: r.reviewedBy.id, fullName: r.reviewedBy.fullName } : null,
    approvals: r.approvals ? r.approvals.map(toOvertimeApprovalDto) : undefined,
  };
}
