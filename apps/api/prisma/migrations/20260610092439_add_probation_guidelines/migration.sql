-- CreateTable
CREATE TABLE "probation_guidelines" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "probation_guidelines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "probation_guidelines_tenant_id_year_idx" ON "probation_guidelines"("tenant_id", "year");

-- AddForeignKey
ALTER TABLE "probation_guidelines" ADD CONSTRAINT "probation_guidelines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
