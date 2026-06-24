import type { PrismaClient } from '@prisma/client';
import { ApprovalFlowType, ApproverType } from '@prisma/client';

// SPEC-041: tên flow thanh toán mặc định của tenant.
export const DEFAULT_PAYMENT_FLOW_NAME = 'Luồng duyệt thanh toán mặc định';

// Luồng duyệt thanh toán cố định 2 bước (SPEC-041 — không có UI cấu hình):
//   Bước 0: MANAGER          → quản lý trực tiếp của người tạo đơn
//   Bước 1: ROLE=super_admin → Founder
// stepOrder là 0-based (theo convention ApprovalStep; snapshot sẽ map sang 1-based).
export const DEFAULT_PAYMENT_FLOW_STEPS = [
  { stepOrder: 0, approverType: ApproverType.MANAGER, roleKey: null, approverId: null },
  { stepOrder: 1, approverType: ApproverType.ROLE, roleKey: 'super_admin', approverId: null },
] as const;

/**
 * Idempotently seed the default tenant-wide PAYMENT approval flow.
 *
 * ApprovalFlow has `@@unique([tenantId, departmentId, flowType])` but Postgres
 * treats each NULL departmentId as distinct, so the unique does NOT enforce a
 * single tenant-default — we guard with an explicit findFirst instead.
 */
export async function seedDefaultPaymentFlowForTenant(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  const existing = await prisma.approvalFlow.findFirst({
    where: { tenantId, departmentId: null, flowType: ApprovalFlowType.PAYMENT },
    select: { id: true },
  });
  if (existing) return;

  await prisma.approvalFlow.create({
    data: {
      tenantId,
      departmentId: null,
      flowType: ApprovalFlowType.PAYMENT,
      name: DEFAULT_PAYMENT_FLOW_NAME,
      active: true,
      steps: { create: DEFAULT_PAYMENT_FLOW_STEPS.map((s) => ({ ...s })) },
    },
  });
}
