-- CreateEnum
CREATE TYPE "AssetAckStatus" AS ENUM ('PENDING', 'SIGNED');

-- CreateEnum
CREATE TYPE "AssetAckMethod" AS ENUM ('ON_SCREEN', 'IN_APP');

-- AlterTable
ALTER TABLE "asset_assignments" ADD COLUMN     "ack_method" "AssetAckMethod",
ADD COLUMN     "ack_status" "AssetAckStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "acknowledged_at" TIMESTAMP(3),
ADD COLUMN     "acknowledged_by_user_id" TEXT,
ADD COLUMN     "signature_image" TEXT;

-- CreateIndex
CREATE INDEX "asset_assignments_tenant_id_ack_status_idx" ON "asset_assignments"("tenant_id", "ack_status");
