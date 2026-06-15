# TODO: SPEC-031 — Probation Evaluation Framework

> Plan: `tasks/031-probation-evaluation-framework-plan.md` · Spec: `docs/specs/031-probation-evaluation-framework.md`

## Phase 1: Foundation
- [x] Slice 1 — Schema (`group`/`rubric` trên ProbationCriteria, `deliverables` trên ProbationReview) + migration + shared types
- [x] Slice 2 — Seed 6 năng lực hiện đại + `group` + rubric BARS tiếng Việt (idempotent, không đụng tenant cũ)

## Phase 2: Backend core
- [x] Slice 3 — BE rubric + group trên criteria (validator 5-mức/score-unique + service + mapper + repo)
- [x] Slice 4 — BE deliverables trên review (validator URL/giới hạn + service patch/submit, bất biến sau submit + mapper)

### Checkpoint A — Backend complete
- [x] `pnpm --filter @hrm/api test -- probation` xanh (70/70); full suite 1130/1130; tsc/migrate sạch; no regression SPEC-030

## Phase 3: Frontend core
- [x] Slice 5 — FE popover hướng dẫn rubric (highlight mức đang chọn) + sub-score What/How theo group
- [x] Slice 6 — FE trình soạn deliverable evidence (add/remove khi DRAFT, read-only sau submit, HR mở link)
- [x] Slice 7 — FE tab cấu hình: chọn group + editor rubric 5 mức (gate `probation:configure`)

### Checkpoint B — Core complete
- [x] Luồng đầy đủ chạy đúng (verify trên preview: sửa rubric+group qua settings → popover highlight mức đang chọn → sub-score What/How live → deliverable lưu nháp persist sau reload); tương thích ngược (tiêu chí không rubric không có nút hướng dẫn, review cũ deliverables=null hiện empty state)

## Phase 4: Polish & Integration
- [x] Slice 8 — Polish (a11y popover, dark, token no-hex, tabular-nums, i18n vi+en) + E2E mở rộng (manager popover→chấm→deliverable có link→nộp→HR assert thấy deliverable/link) — E2E 2/2 xanh (SPEC-030 + SPEC-031); dark mode verify bằng screenshot; web unit 407 pass (6 fail là lỗi asset có sẵn, ngoài phạm vi)
