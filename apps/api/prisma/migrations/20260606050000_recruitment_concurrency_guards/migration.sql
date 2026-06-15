-- Enforce "one ACTIVE application per (candidate, job)" at the database level.
-- A partial unique index is required (not a plain @@unique): a candidate may be
-- rejected then re-apply to the same job, leaving multiple closed rows with the
-- same tuple — only ACTIVE rows must be unique. Partial indexes are not
-- expressible in schema.prisma, so this lives as a raw migration.
CREATE UNIQUE INDEX "uniq_active_application"
  ON "applications" ("tenant_id", "candidate_id", "job_id")
  WHERE "status" = 'ACTIVE';
