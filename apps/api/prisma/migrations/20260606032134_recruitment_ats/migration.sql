-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobEmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN');

-- CreateEnum
CREATE TYPE "StageType" AS ENUM ('SOURCED', 'SCREEN', 'ASSESSMENT', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CandidateSource" AS ENUM ('CAREER_SITE', 'JOB_BOARD', 'REFERRAL', 'SOURCED', 'AGENCY', 'EVENT', 'DIRECT');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('ACTIVE', 'HIRED', 'REJECTED', 'WITHDRAWN', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "RejectionReason" AS ENUM ('UNDERQUALIFIED', 'OVERQUALIFIED', 'FAILED_ASSESSMENT', 'CULTURE_FIT', 'COMP_MISMATCH', 'POSITION_FILLED', 'CANDIDATE_WITHDREW', 'NO_SHOW', 'OTHER');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('CV', 'COVER_LETTER', 'OTHER');

-- CreateEnum
CREATE TYPE "ParseStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('ONSITE', 'VIDEO', 'PHONE');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ScorecardOverall" AS ENUM ('STRONG_NO', 'NO', 'YES', 'STRONG_YES');

-- CreateEnum
CREATE TYPE "HiringTeamRole" AS ENUM ('RECRUITER', 'HIRING_MANAGER', 'INTERVIEWER', 'COORDINATOR');

-- CreateTable
CREATE TABLE "pipeline_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_template_stages" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "StageType" NOT NULL,

    CONSTRAINT "pipeline_template_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "department_id" TEXT,
    "position_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "employment_type" "JobEmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "location" TEXT,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" TEXT NOT NULL,
    "opened_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_stages" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "StageType" NOT NULL,

    CONSTRAINT "job_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_hiring_team" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "team_role" "HiringTeamRole" NOT NULL,

    CONSTRAINT "job_hiring_team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "current_title" TEXT,
    "total_years_exp" DOUBLE PRECISION,
    "source" "CandidateSource" NOT NULL DEFAULT 'DIRECT',
    "links" JSONB,
    "avatar" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "gender" "Gender",
    "skills" TEXT[],
    "raw_cv_text" TEXT,
    "consent_given_at" TIMESTAMP(3),
    "consent_source" TEXT,
    "retention_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_attachments" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL DEFAULT 'CV',
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "parse_status" "ParseStatus" NOT NULL DEFAULT 'PENDING',
    "parser_provider" TEXT,
    "parsed_data" JSONB,
    "parsed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "current_stage_id" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "CandidateSource" NOT NULL DEFAULT 'DIRECT',
    "rejection_reason" "RejectionReason",
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_stage_history" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "from_stage_id" TEXT,
    "to_stage_id" TEXT NOT NULL,
    "changed_by_id" TEXT NOT NULL,
    "note" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "stage_id" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_min" INTEGER NOT NULL DEFAULT 60,
    "mode" "InterviewMode" NOT NULL DEFAULT 'ONSITE',
    "location" TEXT,
    "meeting_url" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_interviewers" (
    "interview_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,

    CONSTRAINT "interview_interviewers_pkey" PRIMARY KEY ("interview_id","employee_id")
);

-- CreateTable
CREATE TABLE "scorecards" (
    "id" TEXT NOT NULL,
    "interview_id" TEXT NOT NULL,
    "interviewer_id" TEXT NOT NULL,
    "overall" "ScorecardOverall" NOT NULL,
    "ratings" JSONB,
    "notes" TEXT,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scorecards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_activities" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "author_id" TEXT,
    "type" TEXT NOT NULL,
    "body" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipeline_templates_tenant_id_idx" ON "pipeline_templates"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_templates_tenant_id_name_key" ON "pipeline_templates"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_template_stages_template_id_order_key" ON "pipeline_template_stages"("template_id", "order");

-- CreateIndex
CREATE INDEX "jobs_tenant_id_status_idx" ON "jobs"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "jobs_department_id_idx" ON "jobs"("department_id");

-- CreateIndex
CREATE INDEX "jobs_position_id_idx" ON "jobs"("position_id");

-- CreateIndex
CREATE INDEX "job_stages_job_id_idx" ON "job_stages"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_stages_job_id_order_key" ON "job_stages"("job_id", "order");

-- CreateIndex
CREATE INDEX "job_hiring_team_employee_id_idx" ON "job_hiring_team"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_hiring_team_job_id_employee_id_key" ON "job_hiring_team"("job_id", "employee_id");

-- CreateIndex
CREATE INDEX "candidates_tenant_id_phone_idx" ON "candidates"("tenant_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_tenant_id_email_key" ON "candidates"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "candidate_attachments_candidate_id_idx" ON "candidate_attachments"("candidate_id");

-- CreateIndex
CREATE INDEX "applications_tenant_id_job_id_current_stage_id_idx" ON "applications"("tenant_id", "job_id", "current_stage_id");

-- CreateIndex
CREATE INDEX "applications_candidate_id_idx" ON "applications"("candidate_id");

-- CreateIndex
CREATE INDEX "application_stage_history_application_id_idx" ON "application_stage_history"("application_id");

-- CreateIndex
CREATE INDEX "interviews_tenant_id_scheduled_at_idx" ON "interviews"("tenant_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "interviews_application_id_idx" ON "interviews"("application_id");

-- CreateIndex
CREATE INDEX "interview_interviewers_employee_id_idx" ON "interview_interviewers"("employee_id");

-- CreateIndex
CREATE INDEX "scorecards_interviewer_id_idx" ON "scorecards"("interviewer_id");

-- CreateIndex
CREATE UNIQUE INDEX "scorecards_interview_id_interviewer_id_key" ON "scorecards"("interview_id", "interviewer_id");

-- CreateIndex
CREATE INDEX "application_activities_application_id_idx" ON "application_activities"("application_id");

-- AddForeignKey
ALTER TABLE "pipeline_templates" ADD CONSTRAINT "pipeline_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_template_stages" ADD CONSTRAINT "pipeline_template_stages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "pipeline_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_stages" ADD CONSTRAINT "job_stages_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_hiring_team" ADD CONSTRAINT "job_hiring_team_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_hiring_team" ADD CONSTRAINT "job_hiring_team_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_attachments" ADD CONSTRAINT "candidate_attachments_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_current_stage_id_fkey" FOREIGN KEY ("current_stage_id") REFERENCES "job_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_from_stage_id_fkey" FOREIGN KEY ("from_stage_id") REFERENCES "job_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_to_stage_id_fkey" FOREIGN KEY ("to_stage_id") REFERENCES "job_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_interviewers" ADD CONSTRAINT "interview_interviewers_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_interviewers" ADD CONSTRAINT "interview_interviewers_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_interviewer_id_fkey" FOREIGN KEY ("interviewer_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_activities" ADD CONSTRAINT "application_activities_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_activities" ADD CONSTRAINT "application_activities_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
