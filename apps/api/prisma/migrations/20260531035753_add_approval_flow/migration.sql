-- CreateEnum
CREATE TYPE "ApproverType" AS ENUM ('MANAGER', 'DEPARTMENT_HEAD', 'ROLE', 'SPECIFIC_USER');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'RETURNED', 'AUTO_SKIPPED');

-- AlterEnum
ALTER TYPE "LeaveStatus" ADD VALUE 'RETURNED';

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "current_step" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "flow_id" TEXT;

-- CreateTable
CREATE TABLE "approval_flows" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "department_id" TEXT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" TEXT NOT NULL,
    "flow_id" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL,
    "approver_type" "ApproverType" NOT NULL,
    "role_key" TEXT,
    "approver_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_approvals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
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

    CONSTRAINT "leave_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_flows_tenant_id_idx" ON "approval_flows"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_flows_tenant_id_department_id_key" ON "approval_flows"("tenant_id", "department_id");

-- CreateIndex
CREATE INDEX "approval_steps_flow_id_idx" ON "approval_steps"("flow_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_steps_flow_id_step_order_key" ON "approval_steps"("flow_id", "step_order");

-- CreateIndex
CREATE INDEX "leave_approvals_request_id_idx" ON "leave_approvals"("request_id");

-- CreateIndex
CREATE INDEX "leave_approvals_tenant_id_idx" ON "leave_approvals"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_approvals_request_id_round_step_order_key" ON "leave_approvals"("request_id", "round", "step_order");

-- CreateIndex
CREATE INDEX "leave_requests_flow_id_idx" ON "leave_requests"("flow_id");

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "approval_flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_flows" ADD CONSTRAINT "approval_flows_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_flows" ADD CONSTRAINT "approval_flows_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "approval_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approvals" ADD CONSTRAINT "leave_approvals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approvals" ADD CONSTRAINT "leave_approvals_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approvals" ADD CONSTRAINT "leave_approvals_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
