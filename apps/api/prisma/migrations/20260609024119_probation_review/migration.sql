-- CreateEnum
CREATE TYPE "ProbationReviewStatus" AS ENUM ('DRAFT', 'PENDING_HR', 'DECIDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProbationOutcome" AS ENUM ('CONFIRM', 'EXTEND', 'FAIL');

-- CreateTable
CREATE TABLE "probation_criteria" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "probation_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "probation_reviews" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "status" "ProbationReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewer_id" TEXT,
    "ratings" JSONB,
    "strengths" TEXT,
    "weaknesses" TEXT,
    "comment" TEXT,
    "recommendation" "ProbationOutcome",
    "submitted_at" TIMESTAMP(3),
    "decided_by_id" TEXT,
    "decision" "ProbationOutcome",
    "decision_note" TEXT,
    "decided_at" TIMESTAMP(3),
    "new_probation_end_date" TIMESTAMP(3),
    "probation_end_date_at_create" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "probation_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "probation_criteria_tenant_id_is_active_idx" ON "probation_criteria"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "probation_reviews_tenant_id_status_idx" ON "probation_reviews"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "probation_reviews_employee_id_idx" ON "probation_reviews"("employee_id");

-- AddForeignKey
ALTER TABLE "probation_criteria" ADD CONSTRAINT "probation_criteria_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "probation_reviews" ADD CONSTRAINT "probation_reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "probation_reviews" ADD CONSTRAINT "probation_reviews_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "probation_reviews" ADD CONSTRAINT "probation_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "probation_reviews" ADD CONSTRAINT "probation_reviews_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
