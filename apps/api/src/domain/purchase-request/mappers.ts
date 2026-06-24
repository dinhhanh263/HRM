import type { Prisma } from '@prisma/client';
import type {
  PurchaseRequestDto,
  PurchaseRequestItemDto,
  PurchaseRequestApprovalDto,
  PurchaseRequestAttachmentDto,
} from '@hrm/shared';

type PurchaseApprovalRow = Prisma.PurchaseRequestApprovalGetPayload<{
  include: { decidedBy: { select: { id: true; fullName: true } } };
}>;

export function toPurchaseApprovalDto(a: PurchaseApprovalRow): PurchaseRequestApprovalDto {
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

type PurchaseItemRow = Prisma.PurchaseRequestItemGetPayload<object>;

export function toPurchaseItemDto(i: PurchaseItemRow): PurchaseRequestItemDto {
  return {
    id: i.id,
    lineNo: i.lineNo,
    sku: i.sku,
    productName: i.productName,
    unit: i.unit,
    // Decimal → string để không mất độ chính xác khi serialize JSON.
    quantity: i.quantity.toString(),
    unitPrice: i.unitPrice.toString(),
    taxRate: i.taxRate.toString(),
    lineSubtotal: i.lineSubtotal.toString(),
    lineTax: i.lineTax.toString(),
    lineTotal: i.lineTotal.toString(),
  };
}

type PurchaseAttachmentRow = Prisma.PurchaseRequestAttachmentGetPayload<object>;

export function toPurchaseAttachmentDto(a: PurchaseAttachmentRow): PurchaseRequestAttachmentDto {
  return {
    id: a.id,
    fileUrl: a.fileUrl,
    fileName: a.fileName,
    mimeType: a.mimeType,
    size: a.size,
    createdAt: a.createdAt.toISOString(),
  };
}

export type PurchaseRequestWithRelations = Prisma.PurchaseRequestGetPayload<{
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
    orderedBy: { select: { id: true; fullName: true } };
    issuingEntity: { select: { id: true; name: true; active: true } };
  };
}>;

export function toPurchaseRequestDto(
  r: PurchaseRequestWithRelations & {
    items?: PurchaseItemRow[];
    approvals?: PurchaseApprovalRow[];
    attachments?: PurchaseAttachmentRow[];
  },
): PurchaseRequestDto {
  return {
    id: r.id,
    tenantId: r.tenantId,
    employeeId: r.employeeId,
    code: r.code,
    title: r.title,
    description: r.description,
    vendorName: r.vendorName,
    expectedDeliveryDate: r.expectedDeliveryDate ? r.expectedDeliveryDate.toISOString() : null,
    currency: r.currency,
    status: r.status,
    // Decimal → string để không mất độ chính xác khi serialize JSON.
    subtotal: r.subtotal.toString(),
    taxAmount: r.taxAmount.toString(),
    totalAmount: r.totalAmount.toString(),
    flowId: r.flowId,
    currentStep: r.currentStep,
    reviewedById: r.reviewedById,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    reviewNote: r.reviewNote,
    orderedById: r.orderedById,
    orderedAt: r.orderedAt ? r.orderedAt.toISOString() : null,
    orderNote: r.orderNote,
    // SPEC-043: pháp nhân phát hành — snapshot trên phiếu + ref tới entity hiện tại.
    issuingEntityId: r.issuingEntityId,
    issuingCompanyName: r.issuingCompanyName,
    issuingAddress: r.issuingAddress,
    issuingTaxCode: r.issuingTaxCode,
    issuingPhone: r.issuingPhone,
    issuingLogoUrl: r.issuingLogoUrl,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    issuingEntity: r.issuingEntity
      ? { id: r.issuingEntity.id, name: r.issuingEntity.name, active: r.issuingEntity.active }
      : null,
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
    orderedBy: r.orderedBy,
    items: r.items?.map(toPurchaseItemDto),
    approvals: r.approvals?.map(toPurchaseApprovalDto),
    attachments: r.attachments?.map(toPurchaseAttachmentDto),
  };
}
