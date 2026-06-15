-- CreateEnum
CREATE TYPE "BulkImportStatus" AS ENUM ('DRAFT', 'REVIEWING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BulkImportItemStatus" AS ENUM ('PARSING', 'PARSED', 'PARSE_FAILED', 'CONFIRMED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "BulkImportItemResolution" AS ENUM ('NEW', 'LINK_EXISTING', 'SKIP');

-- CreateTable
CREATE TABLE "bulk_import_batches" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "status" "BulkImportStatus" NOT NULL DEFAULT 'DRAFT',
    "total_items" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "bulk_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_import_items" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "status" "BulkImportItemStatus" NOT NULL DEFAULT 'PARSING',
    "resolution" "BulkImportItemResolution" NOT NULL DEFAULT 'NEW',
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "raw_cv_text" TEXT,
    "parse_status" "ParseStatus" NOT NULL DEFAULT 'PENDING',
    "parser_provider" TEXT,
    "parsed_data" JSONB,
    "reviewed_data" JSONB,
    "duplicate_of_candidate_id" TEXT,
    "duplicate_reason" TEXT,
    "candidate_id" TEXT,
    "application_id" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulk_import_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bulk_import_batches_tenant_id_job_id_idx" ON "bulk_import_batches"("tenant_id", "job_id");

-- CreateIndex
CREATE INDEX "bulk_import_items_batch_id_idx" ON "bulk_import_items"("batch_id");

-- AddForeignKey
ALTER TABLE "bulk_import_batches" ADD CONSTRAINT "bulk_import_batches_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_import_items" ADD CONSTRAINT "bulk_import_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "bulk_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
