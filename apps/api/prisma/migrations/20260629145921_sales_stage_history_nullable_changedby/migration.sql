-- DropForeignKey
ALTER TABLE "deal_stage_history" DROP CONSTRAINT "deal_stage_history_changed_by_id_fkey";

-- AlterTable
ALTER TABLE "deal_stage_history" ALTER COLUMN "changed_by_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
