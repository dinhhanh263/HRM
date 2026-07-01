-- CreateEnum
CREATE TYPE "SpendingPlanStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "spending_plans" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "issuing_entity_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "SpendingPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "submitted_by_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spending_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spending_plan_items" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "category_id" TEXT,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "expected_date" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "spending_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "spending_plans_tenant_id_period_status_idx" ON "spending_plans"("tenant_id", "period", "status");

-- CreateIndex
CREATE UNIQUE INDEX "spending_plans_department_id_period_issuing_entity_id_key" ON "spending_plans"("department_id", "period", "issuing_entity_id");

-- CreateIndex
CREATE INDEX "spending_plan_items_plan_id_idx" ON "spending_plan_items"("plan_id");

-- AddForeignKey
ALTER TABLE "spending_plans" ADD CONSTRAINT "spending_plans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spending_plans" ADD CONSTRAINT "spending_plans_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spending_plans" ADD CONSTRAINT "spending_plans_issuing_entity_id_fkey" FOREIGN KEY ("issuing_entity_id") REFERENCES "issuing_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spending_plan_items" ADD CONSTRAINT "spending_plan_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "spending_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spending_plan_items" ADD CONSTRAINT "spending_plan_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
