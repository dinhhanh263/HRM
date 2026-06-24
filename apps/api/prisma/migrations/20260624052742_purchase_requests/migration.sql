-- CreateEnum
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED', 'ORDERED');

-- AlterEnum
ALTER TYPE "ApprovalFlowType" ADD VALUE 'PURCHASE';

-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "vendor_name" TEXT NOT NULL,
    "expected_delivery_date" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'PENDING',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "flow_id" TEXT,
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "ordered_by_id" TEXT,
    "ordered_at" TIMESTAMP(3),
    "order_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_items" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "sku" TEXT,
    "product_name" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 8,
    "line_subtotal" DECIMAL(14,2) NOT NULL,
    "line_tax" DECIMAL(14,2) NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "purchase_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_approvals" (
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

    CONSTRAINT "purchase_request_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_attachments" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_request_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_requests_tenant_id_status_idx" ON "purchase_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "purchase_requests_employee_id_idx" ON "purchase_requests"("employee_id");

-- CreateIndex
CREATE INDEX "purchase_requests_flow_id_idx" ON "purchase_requests"("flow_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_tenant_id_code_key" ON "purchase_requests"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "purchase_request_items_request_id_idx" ON "purchase_request_items"("request_id");

-- CreateIndex
CREATE INDEX "purchase_request_approvals_request_id_idx" ON "purchase_request_approvals"("request_id");

-- CreateIndex
CREATE INDEX "purchase_request_approvals_tenant_id_idx" ON "purchase_request_approvals"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_request_approvals_request_id_round_step_order_key" ON "purchase_request_approvals"("request_id", "round", "step_order");

-- CreateIndex
CREATE INDEX "purchase_request_attachments_request_id_idx" ON "purchase_request_attachments"("request_id");

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_ordered_by_id_fkey" FOREIGN KEY ("ordered_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "approval_flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_approvals" ADD CONSTRAINT "purchase_request_approvals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_approvals" ADD CONSTRAINT "purchase_request_approvals_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_approvals" ADD CONSTRAINT "purchase_request_approvals_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_attachments" ADD CONSTRAINT "purchase_request_attachments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
