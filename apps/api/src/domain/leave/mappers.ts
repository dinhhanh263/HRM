import type { LeaveType, Prisma } from '@prisma/client';
import type { LeaveTypeDto, LeaveRequestDto, LeaveApprovalDto, ApprovalFlowDto } from '@hrm/shared';
import type { ApprovalFlowWithRelations } from '../repositories/approval-flow.repository.js';

type LeaveApprovalRow = Prisma.LeaveApprovalGetPayload<{
  include: { decidedBy: { select: { id: true; fullName: true } } };
}>;

export function toLeaveApprovalDto(a: LeaveApprovalRow): LeaveApprovalDto {
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

export function toLeaveTypeDto(lt: LeaveType): LeaveTypeDto {
  return {
    id: lt.id,
    tenantId: lt.tenantId,
    name: lt.name,
    code: lt.code,
    colorHex: lt.colorHex,
    defaultDays: lt.defaultDays,
    paid: lt.paid,
    requiresAttachment: lt.requiresAttachment,
    active: lt.active,
    createdAt: lt.createdAt.toISOString(),
    updatedAt: lt.updatedAt.toISOString(),
  };
}

export type LeaveRequestWithRelations = Prisma.LeaveRequestGetPayload<{
  include: {
    leaveType: { select: { id: true; name: true; code: true; colorHex: true; paid: true } };
    employee: {
      select: {
        id: true;
        fullName: true;
        employeeCode: true;
        avatar: true;
        department: { select: { name: true } };
      };
    };
    reviewedBy: { select: { id: true; fullName: true } };
  };
}>;

export function toLeaveRequestDto(
  r: LeaveRequestWithRelations & { approvals?: LeaveApprovalRow[] },
): LeaveRequestDto {
  return {
    id: r.id,
    tenantId: r.tenantId,
    employeeId: r.employeeId,
    leaveTypeId: r.leaveTypeId,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate.toISOString(),
    halfDay: r.halfDay,
    totalDays: r.totalDays,
    reason: r.reason,
    attachmentUrl: r.attachmentUrl,
    status: r.status,
    flowId: r.flowId,
    currentStep: r.currentStep,
    reviewedById: r.reviewedById,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    reviewNote: r.reviewNote,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    leaveType: r.leaveType,
    employee: r.employee
      ? {
          id: r.employee.id,
          fullName: r.employee.fullName,
          employeeCode: r.employee.employeeCode,
          avatar: r.employee.avatar,
          departmentName: r.employee.department?.name ?? null,
        }
      : null,
    reviewedBy: r.reviewedBy,
    approvals: r.approvals ? r.approvals.map(toLeaveApprovalDto) : undefined,
  };
}

export function toApprovalFlowDto(f: ApprovalFlowWithRelations): ApprovalFlowDto {
  return {
    id: f.id,
    tenantId: f.tenantId,
    departmentId: f.departmentId,
    departmentName: f.department?.name ?? null,
    flowType: f.flowType,
    name: f.name,
    active: f.active,
    steps: f.steps.map((s) => ({
      id: s.id,
      stepOrder: s.stepOrder,
      approverType: s.approverType,
      roleKey: s.roleKey,
      approverId: s.approverId,
      approver: s.approver
        ? { id: s.approver.id, fullName: s.approver.fullName, employeeCode: s.approver.employeeCode }
        : null,
    })),
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}
