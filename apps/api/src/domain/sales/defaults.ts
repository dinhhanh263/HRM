import type { PrismaClient } from '@prisma/client';
import { SalesStageType } from '@prisma/client';
import { loadPermissionIdMap, syncRolePermissions } from '../rbac/catalog.js';

// SPEC-045: Sales / CRM tenant defaults — system roles + default pipeline.
//
// SALES_REP / SALES_MANAGER are seeded as protected (`isSystem`) tenant roles but
// are deliberately NOT part of `SYSTEM_ROLES` (domain/rbac/catalog.ts): the legacy
// `UserRole` enum stays at its 5 values, and these roles follow the custom-role
// path (SPEC-014 — enum falls back to EMPLOYEE; permissions flow through grants).
// Assigned to employees via the Roles UI, not the basic employee role dropdown.

interface SalesRoleDef {
  key: string;
  name: string;
  description: string;
  permissions: string[];
}

const SHELL = ['dashboard:view', 'notifications:view'];

export const SALES_ROLES: SalesRoleDef[] = [
  {
    key: 'sales_manager',
    name: 'Trưởng nhóm kinh doanh',
    description: 'Quản lý & phân bổ lead toàn nhóm, theo dõi pipeline và báo cáo (view_all)',
    permissions: [
      ...SHELL,
      'sales:customer_view', 'sales:customer_create', 'sales:customer_update', 'sales:customer_assign',
      'sales:deal_view', 'sales:deal_create', 'sales:deal_update', 'sales:deal_move',
      'sales:product_view', 'sales:product_manage',
      'sales:quote_view', 'sales:quote_manage',
      'sales:task_view', 'sales:task_manage',
      'sales:email_send', 'sales:template_manage',
      'sales:report_view', 'sales:view_all',
    ],
  },
  {
    key: 'sales_rep',
    name: 'Nhân viên kinh doanh',
    description: 'Quản lý lead/khách của mình + Lead Pool; tạo deal, báo giá, gửi email, follow-up',
    permissions: [
      ...SHELL,
      'sales:customer_view', 'sales:customer_create', 'sales:customer_update',
      'sales:deal_view', 'sales:deal_create', 'sales:deal_update', 'sales:deal_move',
      'sales:product_view',
      'sales:quote_view', 'sales:quote_manage',
      'sales:task_view', 'sales:task_manage',
      'sales:email_send',
      'sales:report_view',
    ],
  },
];

/**
 * Idempotently seed the SALES_REP / SALES_MANAGER tenant roles and sync their
 * permission grants. Mirrors the sync shape in rbac/catalog.ts but stays
 * self-contained so it never disturbs the 5 enum-backed system roles.
 */
export async function seedDefaultSalesRolesForTenant(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  const permissionByKey = await loadPermissionIdMap(prisma);

  for (const def of SALES_ROLES) {
    const role = await prisma.role.upsert({
      where: { tenantId_key: { tenantId, key: def.key } },
      update: { name: def.name, description: def.description, isSystem: true },
      create: { tenantId, key: def.key, name: def.name, description: def.description, isSystem: true },
    });
    await syncRolePermissions(prisma, role.id, def.permissions, permissionByKey);
  }
}

// Default pipeline (SPEC-045 Đ D3): seed một pipeline dùng chung cho tenant.
// `probability` để forecast (Σ amount × probability của deal OPEN).
export const DEFAULT_SALES_PIPELINE_NAME = 'Quy trình bán hàng mặc định';

export const DEFAULT_SALES_STAGES = [
  { order: 0, name: 'Mới', type: SalesStageType.NEW, probability: 10 },
  { order: 1, name: 'Sàng lọc', type: SalesStageType.QUALIFYING, probability: 25 },
  { order: 2, name: 'Báo giá', type: SalesStageType.PROPOSAL, probability: 50 },
  { order: 3, name: 'Đàm phán', type: SalesStageType.NEGOTIATION, probability: 75 },
  { order: 4, name: 'Thắng', type: SalesStageType.WON, probability: 100 },
  { order: 5, name: 'Thua', type: SalesStageType.LOST, probability: 0 },
] as const;

/**
 * Idempotently seed the tenant's default sales pipeline + its stages. Guarded by
 * an explicit findFirst on `isDefault` so re-running never duplicates.
 */
export async function seedDefaultSalesPipelineForTenant(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  const existing = await prisma.salesPipeline.findFirst({
    where: { tenantId, isDefault: true },
    select: { id: true },
  });
  if (existing) return;

  await prisma.salesPipeline.create({
    data: {
      tenantId,
      name: DEFAULT_SALES_PIPELINE_NAME,
      isDefault: true,
      stages: { create: DEFAULT_SALES_STAGES.map((s) => ({ ...s })) },
    },
  });
}
