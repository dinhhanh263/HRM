-- CreateEnum
CREATE TYPE "TopUpStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "topup_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "issuing_entity_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "needed_by_date" TIMESTAMP(3),
    "period" TEXT,
    "justification" TEXT NOT NULL,
    "status" "TopUpStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "funded_account_id" TEXT,
    "funded_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topup_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "topup_requests_tenant_id_status_idx" ON "topup_requests"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "topup_requests" ADD CONSTRAINT "topup_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topup_requests" ADD CONSTRAINT "topup_requests_issuing_entity_id_fkey" FOREIGN KEY ("issuing_entity_id") REFERENCES "issuing_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topup_requests" ADD CONSTRAINT "topup_requests_funded_account_id_fkey" FOREIGN KEY ("funded_account_id") REFERENCES "fund_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
