-- AlterTable
ALTER TABLE "probation_criteria" ADD COLUMN     "group" TEXT NOT NULL DEFAULT 'PERFORMANCE',
ADD COLUMN     "rubric" JSONB;

-- AlterTable
ALTER TABLE "probation_reviews" ADD COLUMN     "deliverables" JSONB;
