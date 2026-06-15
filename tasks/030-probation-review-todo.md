# TODO: SPEC-030 — Probation Review

> Plan: `tasks/030-probation-review-plan.md` · Spec: `docs/specs/030-probation-review.md`

## Phase 1: Foundation
- [x] Slice 1 — Schema (ProbationCriteria, ProbationReview, enums, back-relations) + migration + shared types
- [x] Slice 2 — Atomicity refactor: `contract.service.createWithinTx`, `employee.service.terminateWithinTx(+reason)` (no behavior change)

### Checkpoint A — Foundation
- [x] build/tsc/migrate sạch; RBAC seed ok; `pnpm --filter @hrm/api test` xanh (no regression)

- [x] Slice 3 — RBAC: thêm `probation:['view','review','decide','configure']` (catalog + system roles + seed + permission i18n)

## Phase 2: Core
- [x] Slice 4 — ProbationCriteria CRUD (BE service/repo/validator/routes + seed mặc định; FE tab cấu hình) — chặn xóa khi đã dùng
- [x] Slice 5 — Danh sách review + tạo draft (BE list/getById/create + scope MANAGER + 1-open; FE /probation DataTable + nav + route)
- [x] Slice 6 — Scorecard chấm điểm 1–5 + lưu nháp + nộp (BE patch/submit validate; FE Sheet form RHF+Zod)
- [x] Slice 7 — HR decide + hệ quả atomic (CONFIRM→Contract / EXTEND→date / FAIL→terminate) + cancel; FE AlertDialog (cảnh báo FAIL)

### Checkpoint B — Core complete
- [x] Luồng đầy đủ chạy đúng & atomic; RBAC server-side đúng mọi role

## Phase 3: Integration & Polish
- [x] Slice 8 — Reminder `probation_ending` deep-link → `/probation` (+ tùy chọn PENDING_HR cho HR)
- [x] Slice 9 — Polish (skeleton/empty/error, badge màu+chữ, dark mode, token, a11y, i18n vi+en) + E2E critical path (manager→nộp→HR CONFIRM→assert Contract FULL_TIME)
