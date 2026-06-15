-- CreateEnum
CREATE TYPE "ApprovalFlowType" AS ENUM ('LEAVE', 'OVERTIME');

-- AlterEnum
ALTER TYPE "OvertimeStatus" ADD VALUE 'RETURNED';

-- DropIndex
DROP INDEX "approval_flows_tenant_id_department_id_key";

-- AlterTable
ALTER TABLE "approval_flows" ADD COLUMN     "flow_type" "ApprovalFlowType" NOT NULL DEFAULT 'LEAVE';

-- AlterTable
ALTER TABLE "overtime_requests" ADD COLUMN     "current_step" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "flow_id" TEXT;

-- CreateTable
CREATE TABLE "overtime_approvals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "overtime_request_id" TEXT NOT NULL,
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

    CONSTRAINT "overtime_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "overtime_approvals_overtime_request_id_idx" ON "overtime_approvals"("overtime_request_id");

-- CreateIndex
CREATE INDEX "overtime_approvals_tenant_id_idx" ON "overtime_approvals"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_approvals_overtime_request_id_round_step_order_key" ON "overtime_approvals"("overtime_request_id", "round", "step_order");

-- CreateIndex
CREATE UNIQUE INDEX "approval_flows_tenant_id_department_id_flow_type_key" ON "approval_flows"("tenant_id", "department_id", "flow_type");

-- CreateIndex
CREATE INDEX "overtime_requests_flow_id_idx" ON "overtime_requests"("flow_id");

-- AddForeignKey
ALTER TABLE "overtime_approvals" ADD CONSTRAINT "overtime_approvals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_approvals" ADD CONSTRAINT "overtime_approvals_overtime_request_id_fkey" FOREIGN KEY ("overtime_request_id") REFERENCES "overtime_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_approvals" ADD CONSTRAINT "overtime_approvals_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "approval_flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

