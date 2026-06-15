-- Enforce "one candidate per normalized phone" at the database level. Phone is
-- nullable (many candidates have only an email), so a plain @@unique would
-- collapse every NULL-phone row into a single conflict. A partial unique index
-- skips NULLs and is not expressible in schema.prisma, so it lives as raw SQL.
-- This is the race-safe backstop behind the service's read-time phone dedupe.
CREATE UNIQUE INDEX "uniq_candidate_phone"
  ON "candidates" ("tenant_id", "phone")
  WHERE "phone" IS NOT NULL;
