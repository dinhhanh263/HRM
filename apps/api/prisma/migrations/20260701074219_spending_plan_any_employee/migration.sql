-- DropForeignKey
ALTER TABLE "spending_plans" DROP CONSTRAINT "spending_plans_department_id_fkey";

-- DropIndex
DROP INDEX "spending_plans_department_id_period_issuing_entity_id_key";

-- AlterTable
ALTER TABLE "spending_plans" ALTER COLUMN "department_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "spending_plans_created_by_id_idx" ON "spending_plans"("created_by_id");

-- AddForeignKey
ALTER TABLE "spending_plans" ADD CONSTRAINT "spending_plans_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
