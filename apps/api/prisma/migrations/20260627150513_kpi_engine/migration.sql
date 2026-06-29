-- CreateEnum
CREATE TYPE "KpiDirection" AS ENUM ('HIGHER_BETTER', 'LOWER_BETTER');

-- CreateEnum
CREATE TYPE "KpiScope" AS ENUM ('INDIVIDUAL', 'TEAM');

-- CreateEnum
CREATE TYPE "KpiInputType" AS ENUM ('MANUAL', 'SURVEY');

-- CreateEnum
CREATE TYPE "KpiScoringMethod" AS ENUM ('THRESHOLD_LINEAR', 'DIRECT', 'BOOLEAN', 'BANDED');

-- CreateEnum
CREATE TYPE "KpiPeriodType" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "KpiCycleStatus" AS ENUM ('DRAFT', 'DATA_ENTRY', 'SELF_ASSESSMENT', 'PENDING_REVIEW', 'FINALIZED', 'CLOSED');

-- CreateEnum
CREATE TYPE "KpiScorecardStatus" AS ENUM ('PENDING', 'SELF_ASSESSED', 'IN_REVIEW', 'FINALIZED');

-- CreateEnum
CREATE TYPE "KpiSurveyType" AS ENUM ('MONTHLY_MORALE', 'QUARTERLY_PEER_360');

-- AlterEnum
ALTER TYPE "ApprovalFlowType" ADD VALUE 'KPI_REVIEW';

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "team_id" TEXT;

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "department_id" TEXT,
    "name" TEXT NOT NULL,
    "lead_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_frameworks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "default_period_type" "KpiPeriodType" NOT NULL DEFAULT 'MONTHLY',
    "pass_anchor" DECIMAL(5,2) NOT NULL DEFAULT 60,
    "target_anchor" DECIMAL(5,2) NOT NULL DEFAULT 90,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_frameworks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_pillars" (
    "id" TEXT NOT NULL,
    "framework_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_pillars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_definitions" (
    "id" TEXT NOT NULL,
    "pillar_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "data_source" TEXT,
    "unit" TEXT,
    "direction" "KpiDirection" NOT NULL DEFAULT 'HIGHER_BETTER',
    "target_value" DECIMAL(14,4),
    "min_value" DECIMAL(14,4),
    "weight_in_pillar" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "scope" "KpiScope" NOT NULL DEFAULT 'INDIVIDUAL',
    "inputType" "KpiInputType" NOT NULL DEFAULT 'MANUAL',
    "scoring_method" "KpiScoringMethod" NOT NULL DEFAULT 'THRESHOLD_LINEAR',
    "survey_kpi_code" TEXT,
    "frequency" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_weight_profiles" (
    "id" TEXT NOT NULL,
    "framework_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_weight_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_profile_pillar_weights" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "pillar_id" TEXT NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "kpi_profile_pillar_weights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_rating_bands" (
    "id" TEXT NOT NULL,
    "framework_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "min_score" DECIMAL(5,2) NOT NULL,
    "max_score" DECIMAL(5,2) NOT NULL,
    "color" TEXT,
    "recommended_action" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_rating_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_framework_assignments" (
    "id" TEXT NOT NULL,
    "framework_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_framework_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_cycles" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "framework_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "period_type" "KpiPeriodType" NOT NULL,
    "status" "KpiCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "config_snapshot" JSONB,
    "created_by_id" TEXT,
    "submitted_by_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "finalized_by_id" TEXT,
    "finalized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_scorecards" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "weight_profile_id" TEXT,
    "weight_profile_name" TEXT,
    "weighted_total" DECIMAL(6,2),
    "rating_label" TEXT,
    "status" "KpiScorecardStatus" NOT NULL DEFAULT 'PENDING',
    "self_comment" TEXT,
    "self_submitted_at" TIMESTAMP(3),
    "strengths" TEXT,
    "areas_to_improve" TEXT,
    "action_plan" TEXT,
    "recognition" TEXT,
    "review_comment" TEXT,
    "reviewer_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "flow_id" TEXT,
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_scorecards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_scorecard_pillars" (
    "id" TEXT NOT NULL,
    "scorecard_id" TEXT NOT NULL,
    "pillar_id" TEXT NOT NULL,
    "score" DECIMAL(6,2),
    "weight" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "kpi_scorecard_pillars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_entries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "kpi_definition_id" TEXT NOT NULL,
    "scorecard_id" TEXT,
    "team_id" TEXT,
    "actual_value" DECIMAL(14,4),
    "computed_score" DECIMAL(6,2),
    "source" TEXT,
    "note" TEXT,
    "entered_by_id" TEXT,
    "entered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_scorecard_approvals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "scorecard_id" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "step_order" INTEGER NOT NULL,
    "approver_type" "ApproverType" NOT NULL,
    "role_key" TEXT,
    "approver_id" TEXT,
    "decision" "ApprovalDecision",
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_scorecard_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_surveys" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "framework_id" TEXT,
    "type" "KpiSurveyType" NOT NULL,
    "title" TEXT NOT NULL,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT true,
    "min_responses" INTEGER NOT NULL DEFAULT 3,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_survey_questions" (
    "id" TEXT NOT NULL,
    "survey_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "scale_min" INTEGER NOT NULL DEFAULT 1,
    "scale_max" INTEGER NOT NULL DEFAULT 10,
    "maps_to_kpi_code" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "kpi_survey_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_survey_responses" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "survey_id" TEXT NOT NULL,
    "cycle_id" TEXT,
    "subject_employee_id" TEXT,
    "answers" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teams_tenant_id_idx" ON "teams"("tenant_id");

-- CreateIndex
CREATE INDEX "teams_department_id_idx" ON "teams"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_tenant_id_name_key" ON "teams"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "kpi_frameworks_tenant_id_idx" ON "kpi_frameworks"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_frameworks_tenant_id_name_key" ON "kpi_frameworks"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "kpi_pillars_framework_id_idx" ON "kpi_pillars"("framework_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_pillars_framework_id_name_key" ON "kpi_pillars"("framework_id", "name");

-- CreateIndex
CREATE INDEX "kpi_definitions_pillar_id_idx" ON "kpi_definitions"("pillar_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_definitions_pillar_id_code_key" ON "kpi_definitions"("pillar_id", "code");

-- CreateIndex
CREATE INDEX "kpi_weight_profiles_framework_id_idx" ON "kpi_weight_profiles"("framework_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_weight_profiles_framework_id_name_key" ON "kpi_weight_profiles"("framework_id", "name");

-- CreateIndex
CREATE INDEX "kpi_profile_pillar_weights_pillar_id_idx" ON "kpi_profile_pillar_weights"("pillar_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_profile_pillar_weights_profile_id_pillar_id_key" ON "kpi_profile_pillar_weights"("profile_id", "pillar_id");

-- CreateIndex
CREATE INDEX "kpi_rating_bands_framework_id_idx" ON "kpi_rating_bands"("framework_id");

-- CreateIndex
CREATE INDEX "kpi_framework_assignments_department_id_idx" ON "kpi_framework_assignments"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_framework_assignments_framework_id_department_id_key" ON "kpi_framework_assignments"("framework_id", "department_id");

-- CreateIndex
CREATE INDEX "kpi_cycles_tenant_id_status_idx" ON "kpi_cycles"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_cycles_tenant_id_framework_id_period_key" ON "kpi_cycles"("tenant_id", "framework_id", "period");

-- CreateIndex
CREATE INDEX "kpi_scorecards_tenant_id_status_idx" ON "kpi_scorecards"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "kpi_scorecards_employee_id_idx" ON "kpi_scorecards"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_scorecards_cycle_id_employee_id_key" ON "kpi_scorecards"("cycle_id", "employee_id");

-- CreateIndex
CREATE INDEX "kpi_scorecard_pillars_scorecard_id_idx" ON "kpi_scorecard_pillars"("scorecard_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_scorecard_pillars_scorecard_id_pillar_id_key" ON "kpi_scorecard_pillars"("scorecard_id", "pillar_id");

-- CreateIndex
CREATE INDEX "kpi_entries_cycle_id_idx" ON "kpi_entries"("cycle_id");

-- CreateIndex
CREATE INDEX "kpi_entries_tenant_id_idx" ON "kpi_entries"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_entries_scorecard_id_kpi_definition_id_key" ON "kpi_entries"("scorecard_id", "kpi_definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_entries_cycle_id_team_id_kpi_definition_id_key" ON "kpi_entries"("cycle_id", "team_id", "kpi_definition_id");

-- CreateIndex
CREATE INDEX "kpi_scorecard_approvals_scorecard_id_idx" ON "kpi_scorecard_approvals"("scorecard_id");

-- CreateIndex
CREATE INDEX "kpi_scorecard_approvals_tenant_id_idx" ON "kpi_scorecard_approvals"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_scorecard_approvals_scorecard_id_round_step_order_key" ON "kpi_scorecard_approvals"("scorecard_id", "round", "step_order");

-- CreateIndex
CREATE INDEX "kpi_surveys_tenant_id_idx" ON "kpi_surveys"("tenant_id");

-- CreateIndex
CREATE INDEX "kpi_survey_questions_survey_id_idx" ON "kpi_survey_questions"("survey_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_survey_questions_survey_id_code_key" ON "kpi_survey_questions"("survey_id", "code");

-- CreateIndex
CREATE INDEX "kpi_survey_responses_survey_id_idx" ON "kpi_survey_responses"("survey_id");

-- CreateIndex
CREATE INDEX "kpi_survey_responses_tenant_id_idx" ON "kpi_survey_responses"("tenant_id");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_frameworks" ADD CONSTRAINT "kpi_frameworks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_pillars" ADD CONSTRAINT "kpi_pillars_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "kpi_frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_pillar_id_fkey" FOREIGN KEY ("pillar_id") REFERENCES "kpi_pillars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_weight_profiles" ADD CONSTRAINT "kpi_weight_profiles_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "kpi_frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_profile_pillar_weights" ADD CONSTRAINT "kpi_profile_pillar_weights_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "kpi_weight_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_profile_pillar_weights" ADD CONSTRAINT "kpi_profile_pillar_weights_pillar_id_fkey" FOREIGN KEY ("pillar_id") REFERENCES "kpi_pillars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_rating_bands" ADD CONSTRAINT "kpi_rating_bands_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "kpi_frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_framework_assignments" ADD CONSTRAINT "kpi_framework_assignments_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "kpi_frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_framework_assignments" ADD CONSTRAINT "kpi_framework_assignments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_cycles" ADD CONSTRAINT "kpi_cycles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_cycles" ADD CONSTRAINT "kpi_cycles_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "kpi_frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_scorecards" ADD CONSTRAINT "kpi_scorecards_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_scorecards" ADD CONSTRAINT "kpi_scorecards_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "kpi_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_scorecards" ADD CONSTRAINT "kpi_scorecards_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_scorecards" ADD CONSTRAINT "kpi_scorecards_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_scorecards" ADD CONSTRAINT "kpi_scorecards_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "approval_flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_scorecard_pillars" ADD CONSTRAINT "kpi_scorecard_pillars_scorecard_id_fkey" FOREIGN KEY ("scorecard_id") REFERENCES "kpi_scorecards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_scorecard_pillars" ADD CONSTRAINT "kpi_scorecard_pillars_pillar_id_fkey" FOREIGN KEY ("pillar_id") REFERENCES "kpi_pillars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_entries" ADD CONSTRAINT "kpi_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_entries" ADD CONSTRAINT "kpi_entries_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "kpi_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_entries" ADD CONSTRAINT "kpi_entries_kpi_definition_id_fkey" FOREIGN KEY ("kpi_definition_id") REFERENCES "kpi_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_entries" ADD CONSTRAINT "kpi_entries_scorecard_id_fkey" FOREIGN KEY ("scorecard_id") REFERENCES "kpi_scorecards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_scorecard_approvals" ADD CONSTRAINT "kpi_scorecard_approvals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_scorecard_approvals" ADD CONSTRAINT "kpi_scorecard_approvals_scorecard_id_fkey" FOREIGN KEY ("scorecard_id") REFERENCES "kpi_scorecards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_surveys" ADD CONSTRAINT "kpi_surveys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_surveys" ADD CONSTRAINT "kpi_surveys_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "kpi_frameworks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_survey_questions" ADD CONSTRAINT "kpi_survey_questions_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "kpi_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_survey_responses" ADD CONSTRAINT "kpi_survey_responses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_survey_responses" ADD CONSTRAINT "kpi_survey_responses_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "kpi_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
