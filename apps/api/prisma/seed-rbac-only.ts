// One-off: re-sync RBAC catalog + system roles (idempotent) — dùng khi thêm permission mới.
// SPEC-041: cũng đồng bộ flow duyệt thanh toán mặc định cho mọi tenant hiện có.
import { PrismaClient } from '@prisma/client';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../src/domain/rbac/catalog.js';
import { seedDefaultPaymentFlowForTenant } from '../src/domain/payment-request/defaults.js';

const prisma = new PrismaClient();

async function main() {
  await seedPermissionCatalog(prisma);
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  for (const t of tenants) {
    await syncSystemRolesForTenant(prisma, t.id);
    await seedDefaultPaymentFlowForTenant(prisma, t.id);
    console.log('synced roles + payment flow for tenant', t.slug);
  }
}

main().finally(() => prisma.$disconnect());
