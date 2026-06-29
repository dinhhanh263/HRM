# TODO-044: KPI / Performance Management Engine

> Plan: [044-kpi-performance-plan.md](044-kpi-performance-plan.md) · Spec: [SPEC-044](../docs/specs/044-kpi-performance-management.md)

## Phase F0 — Foundation + seed Agile
- [x] 0.1 Prisma models + enums + migration (`Team`, `Employee.teamId`, `ApprovalFlowType.KPI_REVIEW`) — migration `20260627150513_kpi_engine`
- [x] 0.2 Shared types `kpi.ts` + RBAC keys `kpi:*` + map roles (EMPLOYEE/MANAGER/HR/PAYROLL_APPROVER)
- [x] 0.3 ⚠️ Scoring engine pure helper + unit tests — `src/domain/kpi/scoring.helper.ts` (22 tests xanh)
- [x] 0.4 Seed "Agile Software Team" framework + default KPI_REVIEW flow (idempotent) — 3 integration tests xanh

### ✅ Checkpoint F0 ĐẠT: migrate sạch · schema validate · scoring 23✓ · seed idempotent khớp Excel · RBAC sync · full suite 1427✓ · API typecheck sạch
### ✅ Review F0 (five-axis) — APPROVE. Fixed: H1 (T1/T2 DIRECT→THRESHOLD_LINEAR), L2 (test weight=0), N1 (cast thừa). Carry-forward M1/L3/F2-invariant → ghi trong plan.

## Phase F1 — Framework Builder
- [x] 1.1 Framework + pillar CRUD (DB+API+UI) + validate Σ=100% — pure `validation.helper.ts` (10 tests)
- [x] 1.2 KPI definition editor (direction/target/min/scope/scoringMethod…) — DefinitionFormSheet
- [x] 1.3 Weight profiles + rating bands + framework↔department assignment + Team CRUD

### ✅ Checkpoint F1 ĐẠT: API 16 integration tests · builder UI verified trên browser · web+api typecheck sạch · full suite 1454✓
### ✅ Review F1 (five-axis) — APPROVE WITH CHANGES. Fixed: H1 (team member prepopulate, tránh xóa nhầm), H2 (tenant-scope dept/lead team), M1 (profile pillar ∈ framework), M2 (band overlap 409), M4 (passAnchor<targetAnchor), L1 (team update atomic) + tests cross-tenant/overlap/profile-guard. Deferred (low): L2 empty-profile grace, L3 assert child∈framework, N3 emoji icons.

## Phase F2 — Cycle + Data Entry + Scoring (lõi)
- [x] 2.1 KpiCycle lifecycle + sinh scorecard rỗng + transitions (DRAFT→DATA_ENTRY→…→FINALIZED, freeze configSnapshot)
- [x] 2.2 Data entry grid (team metrics + per-member sheet) + recompute + team-scope fan-out + `computeScorecard` pure helper

### ✅ Checkpoint F2 ĐẠT: scoring khớp số kiểm chứng (81/70.5/90 + rating) · team fan-out 1 entry chia sẻ · recompute khi sửa · chặn framework lệch · verified browser (20 scorecards, nhập T3/T4→Team Health 90→Xuất sắc live) · carry-forward F2 đã làm: neo điểm đọc framework.passAnchor/targetAnchor
### ✅ Review F2 (five-axis) — APPROVE. Fixed: H1 (upsert+recompute atomic trong 1 transaction), H2 (FINALIZED bất biến — guard setScorecardProfile + test), M1 (CHECK scorecard XOR team + FK teamId→Team, migration), M2 (bound actualValue), L1 (KPI_CYCLE_TRANSITIONS dùng chung shared), L2 (enteredAt). M3 (recompute-all) chấp nhận + comment. Full suite 1464✓.

## Phase F3 — Dashboard + Aggregate
- [x] 3.1 Member scorecard + trend chart (Recharts) + `/kpi/me` + `/kpi/employee/:id` + scope RBAC (self/view_team→reports/view_all)
- [x] 3.2 Team aggregate / leaderboard (client-side từ cycle scorecards: TB team, quán quân, TB pillar)

### ✅ Checkpoint F3 ĐẠT: dashboard cá nhân + trend Recharts + history table · team aggregate · verified browser (Cao Đức Anh 90/Xuất sắc + chart) · recharts 3.9.0
### ✅ Review F3 (five-axis) — APPROVE (scope airtight, KHÔNG lỗ auth). Fixed: scope refactor vào domain `getEmployeeHistoryForViewer` + cross-tenant target→404 + ordering theo cycle.createdAt + **7 scope-denial tests** (self/view_team report vs non-report/plain→other 403/view_all/404/super_admin). Full suite 1472✓.

## Phase F4 — Self-assessment + Review + Approval
- [x] 4.1 Self-assessment (nhân viên, ownership) + manager review/calibrate + qualitative notes (strengths/areas/action/recognition)
- [x] 4.2 KPI_REVIEW approval chain (reuse engine: Manager→HR, auto-skip) + return→resubmit + finalize scorecard

### ✅ Checkpoint F4 ĐẠT: 5 integration tests · verified browser (ReviewSheet timeline + self-assess card) · full suite 1477✓
### ✅ Review F4 (five-axis) — APPROVE. Fixed: resubmit thiếu approver-check (Important → matchesApprover + test 403) · RETURNED bắt buộc note · self-assess chặn rỗng · i18n "(vòng N)" → key · hoist N+1 flow query.

## Phase F5 — Survey Team Health
- [x] 5.1 Survey CRUD + questions + toggle active (admin `kpi:survey_manage`) — KpiSurveysPage
- [x] 5.2 Respond ẩn danh (no rater column) + aggregate → KpiEntry TEAM + ngưỡng N + scope respond cho nhân viên

### ✅ Checkpoint F5 ĐẠT: 5 integration tests · verified browser (admin 2 survey seed) · full suite 1482✓
### ✅ Review F5 (five-axis) — REQUEST CHANGES → resolved. Anonymity đúng (schema không cột định danh). Fixed: hoist threshold gate (bug) · validate cycleId khi respond (cross-tenant) · **ballot-stuffing: KpiSurveyParticipation** (one-response/person, lưu AI không lưu GÌ → giữ ẩn danh, test 409) · scaleMin≤Max · tenantId responsesForCycle. Limitations (per-team morale, 360 rater eligibility) ghi trong plan.

## Phase F6 — Export + Polish
- [x] 6.1 Export Excel (cycle: thành viên × trụ cột + tổng + xếp loại) + delta insight "so kỳ trước" trên member dashboard
- [x] 6.2 Sidebar (KPI/Team/Survey/Khung KPI/KPI của tôi) + ⌘K (3 entry KPI) + i18n vi/en đầy đủ

### ✅ Checkpoint F6 ĐẠT: export 2 tests (đọc lại đúng số liệu + empty/null) · verified browser (export 200 xlsx 7632B · ⌘K 3 entry KPI · delta insight) · full suite 1484✓
### ✅ Review F6 (five-axis) — APPROVE. Fixed: anchor download theo pattern repo (appendChild+remove) + test edge empty/null. Tenant-safe (getDetail), ⌘K permission-filtered, i18n parity.

---
## 🎉 SPEC-044 HOÀN TẤT — F0→F6 (6/6 phase), mỗi phase build→verify→five-axis review→fix. Full suite 1484✓ · web+api typecheck sạch.
