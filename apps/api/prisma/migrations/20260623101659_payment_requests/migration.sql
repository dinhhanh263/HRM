-- CreateEnum
CREATE TYPE "PaymentRequestType" AS ENUM ('REIMBURSEMENT', 'ADVANCE', 'VENDOR_PAYMENT');

-- CreateEnum
CREATE TYPE "PaymentRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED', 'PAID');

-- AlterEnum
ALTER TYPE "ApprovalDecision" ADD VALUE 'REJECTED';

-- AlterEnum
ALTER TYPE "ApprovalFlowType" ADD VALUE 'PAYMENT';

-- CreateTable
CREATE TABLE "payment_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "type" "PaymentRequestType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "status" "PaymentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "expense_date" TIMESTAMP(3),
    "category" TEXT,
    "needed_by_date" TIMESTAMP(3),
    "vendor_name" TEXT,
    "invoice_number" TEXT,
    "due_date" TIMESTAMP(3),
    "flow_id" TEXT,
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "paid_by_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "payment_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_request_approvals" (
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

    CONSTRAINT "payment_request_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_request_attachments" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_request_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_requests_tenant_id_status_idx" ON "payment_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "payment_requests_employee_id_idx" ON "payment_requests"("employee_id");

-- CreateIndex
CREATE INDEX "payment_requests_flow_id_idx" ON "payment_requests"("flow_id");

-- CreateIndex
CREATE INDEX "payment_request_approvals_request_id_idx" ON "payment_request_approvals"("request_id");

-- CreateIndex
CREATE INDEX "payment_request_approvals_tenant_id_idx" ON "payment_request_approvals"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_request_approvals_request_id_round_step_order_key" ON "payment_request_approvals"("request_id", "round", "step_order");

-- CreateIndex
CREATE INDEX "payment_request_attachments_request_id_idx" ON "payment_request_attachments"("request_id");

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_paid_by_id_fkey" FOREIGN KEY ("paid_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "approval_flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_request_approvals" ADD CONSTRAINT "payment_request_approvals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_request_approvals" ADD CONSTRAINT "payment_request_approvals_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "payment_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_request_approvals" ADD CONSTRAINT "payment_request_approvals_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_request_attachments" ADD CONSTRAINT "payment_request_attachments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "payment_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
