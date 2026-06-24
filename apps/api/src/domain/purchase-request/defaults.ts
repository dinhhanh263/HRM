import type { PrismaClient } from '@prisma/client';
import { ApprovalFlowType, ApproverType } from '@prisma/client';

// SPEC-042: tên flow duyệt mua hàng mặc định của tenant.
export const DEFAULT_PURCHASE_FLOW_NAME = 'Luồng duyệt mua hàng mặc định';

// Luồng duyệt mua hàng cố định 2 bước (SPEC-042 — không có UI cấu hình):
//   Bước 0: MANAGER          → quản lý trực tiếp của người tạo phiếu
//   Bước 1: ROLE=super_admin → Founder
// stepOrder là 0-based (theo convention ApprovalStep; snapshot map sang 1-based).
export const DEFAULT_PURCHASE_FLOW_STEPS = [
  { stepOrder: 0, approverType: ApproverType.MANAGER, roleKey: null, approverId: null },
  { stepOrder: 1, approverType: ApproverType.ROLE, roleKey: 'super_admin', approverId: null },
] as const;

/**
 * Idempotently seed the default tenant-wide PURCHASE approval flow.
 *
 * ApprovalFlow has `@@unique([tenantId, departmentId, flowType])` but Postgres
 * treats each NULL departmentId as distinct, so the unique does NOT enforce a
 * single tenant-default — we guard with an explicit findFirst instead.
 */
export async function seedDefaultPurchaseFlowForTenant(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  const existing = await prisma.approvalFlow.findFirst({
    where: { tenantId, departmentId: null, flowType: ApprovalFlowType.PURCHASE },
    select: { id: true },
  });
  if (existing) return;

  await prisma.approvalFlow.create({
    data: {
      tenantId,
      departmentId: null,
      flowType: ApprovalFlowType.PURCHASE,
      name: DEFAULT_PURCHASE_FLOW_NAME,
      active: true,
      steps: { create: DEFAULT_PURCHASE_FLOW_STEPS.map((s) => ({ ...s })) },
    },
  });
}
