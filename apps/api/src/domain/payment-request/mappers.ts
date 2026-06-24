import type { Prisma } from '@prisma/client';
import type {
  PaymentRequestDto,
  PaymentRequestApprovalDto,
  PaymentRequestAttachmentDto,
} from '@hrm/shared';

type PaymentApprovalRow = Prisma.PaymentRequestApprovalGetPayload<{
  include: { decidedBy: { select: { id: true; fullName: true } } };
}>;

export function toPaymentApprovalDto(a: PaymentApprovalRow): PaymentRequestApprovalDto {
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

type PaymentAttachmentRow = Prisma.PaymentRequestAttachmentGetPayload<object>;

export function toPaymentAttachmentDto(a: PaymentAttachmentRow): PaymentRequestAttachmentDto {
  return {
    id: a.id,
    fileUrl: a.fileUrl,
    fileName: a.fileName,
    mimeType: a.mimeType,
    size: a.size,
    createdAt: a.createdAt.toISOString(),
  };
}

export type PaymentRequestWithRelations = Prisma.PaymentRequestGetPayload<{
  include: {
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
    paidBy: { select: { id: true; fullName: true } };
  };
}>;

export function toPaymentRequestDto(
  r: PaymentRequestWithRelations & {
    approvals?: PaymentApprovalRow[];
    attachments?: PaymentAttachmentRow[];
  },
): PaymentRequestDto {
  return {
    id: r.id,
    tenantId: r.tenantId,
    employeeId: r.employeeId,
    type: r.type,
    title: r.title,
    description: r.description,
    // Decimal → string để không mất độ chính xác khi serialize JSON.
    amount: r.amount.toString(),
    currency: r.currency,
    status: r.status,
    expenseDate: r.expenseDate ? r.expenseDate.toISOString() : null,
    category: r.category,
    neededByDate: r.neededByDate ? r.neededByDate.toISOString() : null,
    vendorName: r.vendorName,
    invoiceNumber: r.invoiceNumber,
    dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    flowId: r.flowId,
    currentStep: r.currentStep,
    reviewedById: r.reviewedById,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    reviewNote: r.reviewNote,
    paidById: r.paidById,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    paymentNote: r.paymentNote,
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
      : null,
    reviewedBy: r.reviewedBy,
    paidBy: r.paidBy,
    approvals: r.approvals?.map(toPaymentApprovalDto),
    attachments: r.attachments?.map(toPaymentAttachmentDto),
  };
}
