-- AlterTable
ALTER TABLE "purchase_requests" ADD COLUMN     "issuing_address" TEXT,
ADD COLUMN     "issuing_company_name" TEXT,
ADD COLUMN     "issuing_entity_id" TEXT,
ADD COLUMN     "issuing_logo_url" TEXT,
ADD COLUMN     "issuing_phone" TEXT,
ADD COLUMN     "issuing_tax_code" TEXT;

-- CreateTable
CREATE TABLE "issuing_entities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "tax_code" TEXT,
    "phone" TEXT,
    "logo_url" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issuing_entities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "issuing_entities_tenant_id_idx" ON "issuing_entities"("tenant_id");

-- CreateIndex
CREATE INDEX "purchase_requests_issuing_entity_id_idx" ON "purchase_requests"("issuing_entity_id");

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_issuing_entity_id_fkey" FOREIGN KEY ("issuing_entity_id") REFERENCES "issuing_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issuing_entities" ADD CONSTRAINT "issuing_entities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SPEC-043 backfill: seed one default IssuingEntity per tenant whose
-- settings.company.name is non-empty, copying name/address/taxCode/phone from the
-- existing company identity (no logo). The id is a DB-generated uuid string —
-- the TEXT column accepts it; the app uses cuid() only for new rows it creates.
INSERT INTO "issuing_entities" ("id", "tenant_id", "name", "address", "tax_code", "phone", "is_default", "active", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  t."id",
  NULLIF(t."settings" #>> '{company,name}', ''),
  NULLIF(t."settings" #>> '{company,address}', ''),
  NULLIF(t."settings" #>> '{company,taxCode}', ''),
  NULLIF(t."settings" #>> '{company,phone}', ''),
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tenants" t
WHERE COALESCE(NULLIF(t."settings" #>> '{company,name}', ''), '') <> '';
