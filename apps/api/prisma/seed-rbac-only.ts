// One-off: re-sync RBAC catalog + system roles (idempotent) — dùng khi thêm permission mới.
import { PrismaClient } from '@prisma/client';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../src/domain/rbac/catalog.js';

const prisma = new PrismaClient();

async function main() {
  await seedPermissionCatalog(prisma);
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  for (const t of tenants) {
    await syncSystemRolesForTenant(prisma, t.id);
    console.log('synced roles for tenant', t.slug);
  }
}

main().finally(() => prisma.$disconnect());
