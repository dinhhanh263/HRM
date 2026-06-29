-- CreateTable
CREATE TABLE "kpi_survey_participations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "survey_id" TEXT NOT NULL,
    "cycle_id" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_survey_participations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kpi_survey_participations_tenant_id_idx" ON "kpi_survey_participations"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_survey_participations_survey_id_cycle_id_user_id_key" ON "kpi_survey_participations"("survey_id", "cycle_id", "user_id");

-- AddForeignKey
ALTER TABLE "kpi_survey_participations" ADD CONSTRAINT "kpi_survey_participations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_survey_participations" ADD CONSTRAINT "kpi_survey_participations_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "kpi_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
