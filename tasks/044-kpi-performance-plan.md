# PLAN-044: KPI / Performance Management Engine

> Spec: [docs/specs/044-kpi-performance-management.md](../docs/specs/044-kpi-performance-management.md)
> Strategy: vertical slices F0→F6. Foundation + risk-first (scoring engine, approval reuse) early.

---

## Phase 1 — Analysis (đã khảo sát codebase)

**Patterns tái dùng (đường dẫn thật, đã verify):**
- Prisma schema: `apps/api/prisma/schema.prisma` — `cuid()`, `tenantId @map`, `@@map` snake_case, `onDelete: Cascade`, không soft-delete (dùng `isActive`).
- Approval engine (pure, tái dùng): `apps/api/src/domain/leave/approval-routing.helper.ts` — `buildApprovalSnapshot` / `findNextActiveStep` / `matchesApprover`. Enum `ApprovalFlowType` + `ApprovalFlow`/`ApprovalStep` trong schema.
- Period/Run pattern: `apps/api/src/domain/services/payroll-run.service.ts` + `PayrollRun`/`Payslip` (period `YYYY-MM`, status machine, `settingsSnapshot` bất biến khi APPROVED).
- Self-assessment 2 chiều: module Probation (SPEC-033) — `ProbationReview` self → manager review.
- RBAC: catalog `packages/shared/src/types/rbac.ts` (`PERMISSION_CATALOG`), system roles `apps/api/src/domain/rbac/catalog.ts`, seed idempotent `apps/api/src/scripts/seed-rbac.ts`, guard `apps/api/src/app/middlewares/authorize.middleware.ts` (`requirePermission`/`requireAnyPermission`), web hook `apps/web/src/hooks/usePermission.ts`.
- Shared DTOs: `packages/shared/src/types/*.ts` + `index.ts` (thêm `kpi.ts`).
- i18n: `apps/web/src/i18n/index.ts` (import locale → resources → ns array). Locale `apps/web/src/i18n/locales/{vi,en}/*.json`.
- Feature folder mẫu: `apps/web/src/features/payment-request/{pages,components,hooks}`.
- Storage GCS: driver `apps/api/src/infrastructure/storage/` (nếu cần file đính kèm review).

**Điểm rủi ro cao → làm sớm:** (1) scoring engine quy đổi điểm + weight (pure, dễ sai biên); (2) tái dùng approval routing cho KPI_REVIEW; (3) mô hình team-scope fan-out điểm xuống thành viên.

---

## Phase 2 — Vertical slices & tasks

### PHASE F0 — Foundation + seed Agile framework

#### Task 0.1 — Prisma models + enums + migration
**Objective:** toàn bộ schema KPI + `Team` + `ApprovalFlowType.KPI_REVIEW`.
**Files:** `apps/api/prisma/schema.prisma`; migration mới `apps/api/prisma/migrations/*_kpi_engine`.
**Models:** `KpiFramework`, `KpiPillar`, `KpiDefinition`, `KpiWeightProfile`, `KpiProfilePillarWeight`, `KpiRatingBand`, `KpiFrameworkAssignment`, `Team` (+ `Employee.teamId?`), `KpiCycle`, `KpiScorecard`, `KpiScorecardPillar`, `KpiEntry`, `KpiSurvey`, `KpiSurveyQuestion`, `KpiSurveyResponse`. Enums: `KpiDirection`, `KpiScope`, `KpiInputType`, `KpiScoringMethod`, `KpiPeriodType`, `KpiCycleStatus`, `KpiScorecardStatus`, `KpiSurveyType`.
**AC:** `prisma migrate dev` chạy sạch; tất cả model có `tenantId` + index `[tenantId, ...]`; `npx prisma validate` pass.
**Deps:** —
**Verify:** migrate + `prisma studio` thấy bảng; lint schema.

#### Task 0.2 — Shared types + RBAC keys
**Objective:** DTO contract + permission catalog.
**Files:** `packages/shared/src/types/kpi.ts` (+ export trong `index.ts`); `packages/shared/src/types/rbac.ts` (thêm `kpi: [...]`); `apps/api/src/domain/rbac/catalog.ts` (map keys vào EMPLOYEE/MANAGER/HR_MANAGER).
**AC:** build `@hrm/shared` pass; `kpi:*` keys xuất hiện trong catalog; gán role đúng ma trận trong spec.
**Deps:** 0.1
**Verify:** `seed-rbac` dry-run thấy keys mới; unit test catalog không trùng key.

#### Task 0.3 — Scoring engine (pure helper) ⚠️ risk-first
**Objective:** `scoreEntry`, `computePillar`, `computeOverall`, `resolveRating`.
**Files:** `apps/api/src/domain/kpi/scoring.helper.ts` + test `*.spec.ts`.
**AC:** `THRESHOLD_LINEAR` đúng cả `HIGHER_BETTER`/`LOWER_BETTER`, biên (actual<min, =min→60, =target→90, >target→90..100); `DIRECT`/`BOOLEAN`/`BANDED`; overall = Σ(pillar×weight); rating tra band.
**Deps:** 0.2
**Verify:** unit test phủ mọi method + biên; 1 ví dụ Agile khớp tính tay.

#### Task 0.4 — Seed Agile framework + default KPI_REVIEW flow
**Objective:** seed framework "Agile Software Team" từ file Excel + flow review mặc định.
**Files:** `apps/api/src/domain/kpi/seed-agile-framework.ts`; hook vào `seed-rbac.ts` hoặc seed riêng; defaults flow (Bước1 MANAGER, Bước2 ROLE hr_manager).
**AC:** seed idempotent; 4 pillar (35/25/25/15), 16 KPI đúng direction/target/min/unit/scope/inputType, 6 weight profile, 5 rating band, 2 survey template; Σ weight=100%.
**Deps:** 0.1, 0.3
**Verify:** chạy seed 2 lần không nhân đôi; integration check counts.

> ### ✅ Checkpoint F0 — Foundation
> - [ ] migrate sạch, schema validate
> - [ ] scoring engine unit test xanh
> - [ ] seed Agile idempotent, số liệu khớp Excel
> - [ ] RBAC keys auto-sync

---

### PHASE F1 — KPI Framework Builder (cấu hình)

#### Task 1.1 — Framework + pillar CRUD (DB+API+UI)
**Files:** API `routes/v1/kpi-framework.routes.ts`, `controllers/kpi-framework.controller.ts`, `services/kpi-framework.service.ts`, `repositories/kpi-framework.repository.ts`, `validators/kpi-framework.validator.ts`; Web `features/kpi/pages/KpiConfigPage.tsx`, `components/FrameworkBuilder.tsx`, `components/PillarEditor.tsx`, `hooks/useKpiConfig.ts`; i18n `kpi.json`.
**AC:** tạo/sửa/xóa framework + pillar (kéo-thả order, trọng số); **validate Σ pillar weight=100%**; route guard `kpi:config`.
**Deps:** F0
**Verify:** integration CRUD + validate 100%; E2E tạo framework rỗng.

#### Task 1.2 — KPI definition editor
**Files:** mở rộng service/controller + `components/KpiDefinitionForm.tsx`.
**AC:** CRUD KPI với đủ field (direction/target/min/unit/scope/inputType/scoringMethod/weightInPillar); validate Σ weightInPillar/pillar=100%.
**Deps:** 1.1
**Verify:** integration; tạo KPI `LOWER_BETTER` lưu đúng.

#### Task 1.3 — Weight profiles + rating bands + assignment + Team CRUD
**Files:** service/controller cho profile/band/assignment/team; `components/WeightProfileEditor.tsx`, `RatingBandEditor.tsx`, `TeamManager.tsx`; gán framework↔department, nhân viên↔team.
**AC:** profile override trọng số (Σ=100%); band không chồng lấn khoảng; gán framework cho department; tạo Team thuộc department + gán member.
**Deps:** 1.1
**Verify:** integration; E2E gán framework Sales mới cho phòng Sales.

> ### ✅ Checkpoint F1 — Builder
> - [ ] HR tạo framework Sales hoàn toàn mới + gán phòng Sales (E2E)
> - [ ] mọi validate Σ=100% chặn đúng
> - [ ] Team CRUD + gán member

---

### PHASE F2 — Cycle + Data Entry + Scoring (lõi giá trị)

#### Task 2.1 — KpiCycle lifecycle (DB+API+UI)
**Files:** API `kpi-cycle.{routes,controller,service,repository,validator}.ts`; Web `pages/KpiPage.tsx`, `components/CycleList.tsx`, `StatusBadge.tsx`, `hooks/useKpiCycles.ts`.
**AC:** tạo cycle theo framework/department + period (`YYYY-MM`/`YYYY-Qn`); transition `DRAFT→DATA_ENTRY→SELF_ASSESSMENT→PENDING_REVIEW→FINALIZED→CLOSED`; sinh scorecard rỗng cho member trong scope; guard `kpi:enter`/`kpi:view`.
**Deps:** F1
**Verify:** integration transition hợp lệ/không hợp lệ.

#### Task 2.2 — Data entry grid + recompute
**Files:** API `kpi-entry` endpoints (bulk upsert + recompute), reuse `scoring.helper.ts`; Web `components/DataEntryGrid.tsx` (ô vàng, điểm live).
**AC:** nhập actual member×KPI → server tính `computedScore` + scorecard pillar/overall/rating; **KPI `scope=TEAM` nhập 1 lần/squad → fan-out** mọi member; optimistic update.
**Deps:** 2.1, 0.3
**Verify:** integration upsert→recompute; ví dụ Agile ra rating đúng; E2E nhập 1 cycle.

> ### ✅ Checkpoint F2 — Core scoring
> - [ ] weighted total & rating khớp ví dụ kiểm chứng
> - [ ] team KPI fan-out đúng
> - [ ] entry sửa → điểm cập nhật live

---

### PHASE F3 — Member Dashboard + Team aggregate

#### Task 3.1 — Member scorecard + trend chart
**Files:** API `kpi-scorecard` read endpoints (gồm xu hướng theo kỳ); Web `components/Scorecard.tsx`, `KpiTrendChart.tsx` (Recharts), `pages/MemberDashboard.tsx`, `pages/MyKpiPage.tsx`.
**AC:** pillar scores + weighted total + rating + xu hướng nhiều kỳ + ghi chú; `/kpi/me` self-view; adaptive theo role; `view`/`view_team`/`view_all` đúng scope.
**Deps:** F2
**Verify:** integration scope (employee ko xem người khác); E2E self-view.

#### Task 3.2 — Team aggregate / leaderboard
**Files:** API aggregate endpoint; Web `components/TeamAggregate.tsx`.
**AC:** trung bình theo pillar, leaderboard, highest performer; lọc theo team/department.
**Deps:** 3.1
**Verify:** integration tính aggregate; UI sort theo điểm.

> ### ✅ Checkpoint F3 — Visualization

---

### PHASE F4 — Self-assessment + Review + Approval chain

#### Task 4.1 — Self-assessment + manager review/calibrate
**Files:** API scorecard `self-assess`/`review` endpoints; Web `components/ReviewSheet.tsx` (Sheet) + self-assess form.
**AC:** employee tự chấm/ghi nhận xét ở `SELF_ASSESSMENT`; manager calibrate điểm (kèm ghi chú lý do) + strengths/areas/action/recognition; scorecard status phản ánh.
**Deps:** F3
**Verify:** integration 2 chiều; E2E self→review.

#### Task 4.2 — KPI_REVIEW approval chain + finalize
**Files:** API tái dùng `approval-routing.helper.ts`; finalize cycle → đóng băng `configSnapshot`; reuse seed flow từ 0.4.
**AC:** Manager→HR calibrate→finalize; auto-skip bước trùng/không người duyệt; sau finalize scorecard **bất biến**.
**Deps:** 4.1
**Verify:** integration chain + auto-skip; thử sửa sau finalize bị chặn.

> ### ✅ Checkpoint F4 — Review
> - [ ] Chốt quy tắc aggregate tháng→quý (Ask First) trước khi code 3.1 trend đa kỳ

---

### PHASE F5 — Survey Team Health (ẩn danh)

#### Task 5.1 — Survey template + scheduling (admin)
**Files:** API `kpi-survey.{routes,controller,service}.ts`; Web `pages/SurveyPage.tsx`, `components/SurveyBuilder.tsx`; guard `kpi:survey_manage`.
**AC:** tạo `MONTHLY_MORALE`/`QUARTERLY_PEER_360` + câu hỏi (scale, mapsToKpiCode) + lịch + ngưỡng N.
**Deps:** F2
**Verify:** integration CRUD survey.

#### Task 5.2 — Respond (ẩn danh) + aggregate → entry
**Files:** API respond endpoint (KHÔNG lưu raterId) + aggregate job ghi vào `KpiEntry` T1/T2; Web form trả lời trong `/kpi/me`.
**AC:** trả lời ẩn danh; **dưới ngưỡng N không lộ điểm**; aggregate ghi vào entry survey-KPI.
**Deps:** 5.1
**Verify:** integration: dưới N ẩn, đủ N hiện + entry cập nhật; assert không có raterId trong DB.

> ### ✅ Checkpoint F5 — Survey

---

### PHASE F6 — Export + Insights

#### Task 6.1 — Export Excel/PDF + delta insight
**Files:** API export builder (tái dùng pattern `payment-request/export.ts`); Web nút export + insight "so kỳ trước" cạnh metric.
**AC:** export scorecard cá nhân & bảng team đúng số liệu; delta hiển thị đúng dấu.
**Deps:** F3
**Verify:** integration export; UI delta.

#### Task 6.2 — Sidebar + ⌘K + i18n hoàn thiện
**Files:** `apps/web/src/components/layout/Sidebar.tsx` (item "KPI / Hiệu suất" nhóm Vận hành, `/kpi`, perm `kpi:view`; builder ở Hệ thống `/settings/kpi`); CommandPalette actions; `nav.json` + `kpi.json` đủ vi/en.
**AC:** menu hiện theo RBAC; ⌘K điều hướng KPI; không hardcode text.
**Deps:** tất cả
**Verify:** E2E điều hướng; kiểm tra key i18n đủ 2 ngôn ngữ.

> ### ✅ Checkpoint F6 — Ship-ready
> - [ ] E2E critical path đầy đủ; lint+typecheck sạch; review 5-axis

---

## Ordering rationale
1. F0 foundation + **scoring engine risk-first** (sai số là rủi ro lớn nhất).
2. F1 builder mở khóa tính đa-phòng-ban (giá trị productize).
3. F2 lõi: nhập liệu + chấm điểm — giá trị dùng được đầu tiên.
4. F3 trực quan hóa → F4 review chính thức → F5 survey → F6 hoàn thiện.

## Review findings — carry-forward (từ review F0, 2026-06-27)
- **[F0 ✓ đã fix] H1** — T1/T2 (survey 1-10 / 1-5) đổi `DIRECT → THRESHOLD_LINEAR` (anchors target/min đã có) để quy đổi đúng; verify trên dev DB.
- **[F2] KpiEntry invariant** — service phải đảm bảo: INDIVIDUAL ⇒ `scorecardId` set & `teamId` null; TEAM ⇒ `teamId` set & `scorecardId` null. Cân nhắc CHECK constraint. Dual-unique hiện đúng nhưng dựa vào invariant này.
- **[F2] Nguồn neo điểm** — scorer phải đọc `framework.passAnchor/targetAnchor` (KHÔNG đọc band edges) → single source of truth (L3).
- **[F5] Ẩn danh 360°** — không expose row theo `subjectEmployeeId` dưới ngưỡng N; cân nhắc làm thô `createdAt` của peer response để tránh suy ra người chấm (M1).
- **[F1] Validate Σ=100%** — service-layer (DB không ép được); giữ assertion seed làm regression guard (M2).

## Known limitations (ghi nhận từ review F5)
- **Survey morale per-team**: phản hồi ẩn danh không gắn team → aggregate là điểm framework-wide áp đều cho mọi team trong cycle (không phải per-team). Muốn per-team cần gắn team-tag (không định danh) lúc submit.
- **360° rater eligibility**: respond chưa kiểm người trả lời có phải rater hợp lệ của subjectEmployeeId (OK cho morale; siết cho 360 ở phase sau).
- **Ballot-stuffing**: đã chặn bằng sổ tham gia `KpiSurveyParticipation` (unique survey+cycle+user, lưu AI chứ không lưu GÌ → giữ ẩn danh). Tương quan theo timestamp về lý thuyết vẫn có thể với DB admin — chấp nhận ở v1.

## Open items cần chốt khi tới nơi (Ask First)
- **Aggregate tháng→quý** (đề xuất: trung bình điểm tháng) — chốt trước Task 3.1/4.x.
- **Team-scope fallback** về Department khi member chưa gán Team.
- **Mốc neo điểm 60/90** có cho khác theo framework không.
