/**
 * Idempotent RBAC + approval-flow sync. Re-syncs the DB permission catalog,
 * system-role grants, and the default LEAVE/PAYMENT/PURCHASE approval flows to
 * match the code catalog. Run after every deploy (and after adding any new
 * permission) — safe to run repeatedly.
 *
 * Lives under `src/` (NOT `prisma/`) on purpose: `tsc` compiles it into `dist`,
 * which the production Docker image ships (it carries `dist` + `node_modules`
 * but NOT `src`). That lets the Cloud Build pipeline run it as a Cloud Run job
 * with plain `node` — no `tsx`, no TypeScript sources at runtime:
 *   node apps/api/dist/scripts/seed-rbac.js
 * Locally (sources present): `pnpm --filter @hrm/api db:seed:rbac`.
 */
import { PrismaClient } from '@prisma/client';
import { seedPermissionCatalog, syncSystemRolesForTenant } from '../domain/rbac/catalog.js';
import { seedDefaultPaymentFlowForTenant } from '../domain/payment-request/defaults.js';
import { seedDefaultPurchaseFlowForTenant } from '../domain/purchase-request/defaults.js';
import {
  seedAgileFrameworkForTenant,
  seedDefaultKpiReviewFlowForTenant,
} from '../domain/kpi/defaults.js';
import {
  seedDefaultSalesRolesForTenant,
  seedDefaultSalesPipelineForTenant,
} from '../domain/sales/defaults.js';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedPermissionCatalog(prisma);
    const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
    for (const tenant of tenants) {
      await syncSystemRolesForTenant(prisma, tenant.id);
      await seedDefaultPaymentFlowForTenant(prisma, tenant.id);
      await seedDefaultPurchaseFlowForTenant(prisma, tenant.id);
      await seedDefaultKpiReviewFlowForTenant(prisma, tenant.id);
      await seedAgileFrameworkForTenant(prisma, tenant.id);
      await seedDefaultSalesRolesForTenant(prisma, tenant.id);
      await seedDefaultSalesPipelineForTenant(prisma, tenant.id);
      console.log(`synced roles + payment + purchase + kpi + sales for tenant ${tenant.slug}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('RBAC seed failed:', err);
    process.exit(1);
  });
