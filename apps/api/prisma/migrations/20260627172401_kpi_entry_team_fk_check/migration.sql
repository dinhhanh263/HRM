-- AddForeignKey
ALTER TABLE "kpi_entries" ADD CONSTRAINT "kpi_entries_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SPEC-044 F2 (review M1): chốt invariant ở DB — mỗi entry là cá nhân (scorecard_id)
-- HOẶC team (team_id), không bao giờ cả hai / không cái nào.
ALTER TABLE "kpi_entries" ADD CONSTRAINT "kpi_entries_scope_xor"
  CHECK (("scorecard_id" IS NOT NULL AND "team_id" IS NULL)
      OR ("scorecard_id" IS NULL AND "team_id" IS NOT NULL));
