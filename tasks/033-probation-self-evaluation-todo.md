# TODO: SPEC-033 — Probation Self Evaluation

> Plan: `tasks/033-probation-self-evaluation-plan.md` · Spec: `docs/specs/033-probation-self-evaluation.md`

## Phase 1: Enablers
- [x] Slice 1 — auth/me trả `employee {id, contractType}` + RBAC `probation:self` (4 role + i18n + seed, kèm script `prisma/seed-rbac-only.ts` re-sync idempotent) + picker tạo review của manager lọc `managerId` (team mình, PROBATION)

## Phase 2: Backend core
- [x] Slice 2 — Schema self (3 cột) + GET /reviews/me (404 nếu không PROBATION) + PATCH /:id/self + POST /:id/self/submit; ownership + privacy DTO + bất biến sau nộp + chặn mềm (12 test mới)

### Checkpoint A — BE core
- [x] probation 110/110 xanh; full API suite 1175/1175; tsc/migrate sạch

## Phase 3: Tích hợp
- [x] Slice 3 — Notification `probation_self_requested` khi tạo review + deep-link `/probation/me`
- [x] Slice 4 — FE trang `/probation/me`: nav theo contractType=PROBATION, form tự chấm (tách component chung `CriteriaRatingBoard` + `ProbationStepIndicator`), Lưu nháp/Nộp confirm, read-only sau nộp, empty state
- [x] Slice 5 — FE scorecard manager/HR: step indicator 1→2→3, badge "NV: x" + sub-score self, khối "NV tự nhận xét", banner chưa nộp (không chặn)

### Checkpoint B — Core complete
- [x] Verify preview: NV (Lê Thử Việc) thấy nav → chấm 8 tiêu chí + nộp → khóa + step 1 done; HR mở scorecard thấy badge self + sub-score 4.5/4.2 + tự nhận xét

## Phase 4: Polish & Integration
- [x] Slice 6 — Polish (dark mode verify bằng screenshot, token-only, i18n vi+en đủ key) + E2E `probation-self-evaluation.spec.ts` 3 actor xanh: NV thấy nav → chấm + nộp (form khóa) → reviewer thấy "NV: 4" + tự nhận xét → nộp → HR đối chiếu + CONFIRM → "Đã quyết định". Toàn bộ 4 E2E probation 4/4 xanh; API 1176/1176
