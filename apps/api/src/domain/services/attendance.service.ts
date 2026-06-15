import { attendanceRepository } from '../repositories/attendance.repository.js';
import { toAttendanceRecordDto } from '../timesheet/mappers.js';
import {
  resolveWorkDate,
  monthRangeUtc,
  computeWorkedHours,
  businessMonthKey,
} from '../timesheet/attendance.helper.js';
import { BadRequestError } from '../../shared/errors/index.js';
import type { AttendanceRecordDto, AdjustAttendanceRequest } from '@hrm/shared';

export interface CheckInInput {
  note?: string;
  workDate?: string;
}

export interface CheckOutInput {
  note?: string;
}

export const attendanceService = {
  async checkIn(
    tenantId: string,
    employeeId: string,
    input: CheckInInput,
    now: Date = new Date(),
  ): Promise<AttendanceRecordDto> {
    const workDate = resolveWorkDate(input.workDate, now);
    const existing = await attendanceRepository.findByEmployeeAndDate(
      tenantId,
      employeeId,
      workDate,
    );
    if (existing?.checkInAt) {
      throw new BadRequestError('Already checked in for this date');
    }
    const created = await attendanceRepository.create({
      tenant: { connect: { id: tenantId } },
      employee: { connect: { id: employeeId } },
      workDate,
      checkInAt: now,
      note: input.note ?? null,
      source: 'SELF',
    });
    return toAttendanceRecordDto(created);
  },

  async checkOut(
    tenantId: string,
    employeeId: string,
    input: CheckOutInput,
    now: Date = new Date(),
  ): Promise<AttendanceRecordDto> {
    const workDate = resolveWorkDate(undefined, now);
    const existing = await attendanceRepository.findByEmployeeAndDate(
      tenantId,
      employeeId,
      workDate,
    );
    if (!existing?.checkInAt) {
      throw new BadRequestError('You must check in before checking out');
    }
    if (existing.checkOutAt) {
      throw new BadRequestError('Already checked out for this date');
    }
    const workedHours = computeWorkedHours(existing.checkInAt, now);
    const updated = await attendanceRepository.update(existing.id, {
      checkOutAt: now,
      workedHours,
      ...(input.note !== undefined ? { note: input.note } : {}),
    });
    return toAttendanceRecordDto(updated);
  },

  async listMine(
    tenantId: string,
    employeeId: string,
    month?: string,
    now: Date = new Date(),
  ): Promise<AttendanceRecordDto[]> {
    const { start, end } = monthRangeUtc(month ?? businessMonthKey(now));
    const rows = await attendanceRepository.findByEmployeeAndRange(
      tenantId,
      employeeId,
      start,
      end,
    );
    return rows.map(toAttendanceRecordDto);
  },

  // Reviewer creates or corrects a member's record. Always stamped
  // MANUAL_ADJUST + adjustedById for audit; workedHours is recomputed
  // server-side whenever both check-in and check-out are present.
  async adjust(
    tenantId: string,
    reviewerEmployeeId: string,
    input: AdjustAttendanceRequest,
    now: Date = new Date(),
  ): Promise<AttendanceRecordDto> {
    const workDate = resolveWorkDate(input.workDate, now);
    const checkInAt = input.checkInAt ? new Date(input.checkInAt) : null;
    const checkOutAt = input.checkOutAt ? new Date(input.checkOutAt) : null;
    const workedHours = checkInAt && checkOutAt ? computeWorkedHours(checkInAt, checkOutAt) : null;
    const note = input.note ?? null;

    const existing = await attendanceRepository.findByEmployeeAndDate(
      tenantId,
      input.employeeId,
      workDate,
    );

    if (existing) {
      const updated = await attendanceRepository.update(existing.id, {
        checkInAt,
        checkOutAt,
        workedHours,
        note,
        source: 'MANUAL_ADJUST',
        adjustedBy: { connect: { id: reviewerEmployeeId } },
      });
      return toAttendanceRecordDto(updated);
    }

    const created = await attendanceRepository.create({
      tenant: { connect: { id: tenantId } },
      employee: { connect: { id: input.employeeId } },
      workDate,
      checkInAt,
      checkOutAt,
      workedHours,
      note,
      source: 'MANUAL_ADJUST',
      adjustedBy: { connect: { id: reviewerEmployeeId } },
    });
    return toAttendanceRecordDto(created);
  },

  // employeeIds = the reviewer's direct reports (manager) or null for
  // tenant-wide (HR). Scope resolution lives in the controller.
  async listForReview(
    tenantId: string,
    employeeIds: string[] | null,
    month?: string,
    now: Date = new Date(),
  ): Promise<AttendanceRecordDto[]> {
    const { start, end } = monthRangeUtc(month ?? businessMonthKey(now));
    const rows = await attendanceRepository.findForReview(tenantId, employeeIds, start, end);
    return rows.map(toAttendanceRecordDto);
  },
};
