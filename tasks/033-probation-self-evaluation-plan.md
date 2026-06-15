# Plan: SPEC-033 — Probation Self Evaluation

> Spec: `docs/specs/033-probation-self-evaluation.md` · Created: 2026-06-11
> Flow 3 bước: Self → Manager → Final. Không đổi state machine; self-eval là artifact
> song song trên review khi DRAFT.

## Bối cảnh codebase (đã khảo sát 2026-06-11)

| Integration point | Hiện trạng |
|---|---|
| RBAC catalog `apps/api/src/domain/rbac/catalog.ts` | probation:view/review/decide/configure; HR đủ 4; MANAGER có view+review; EMPLOYEE chưa có gì → thêm `probation:self` cho cả 4 system role |
| `auth.service.ts` userToDto (dòng 52) | CHƯA có employee info → mở rộng `employee: { id, contractType } \| null` |
| Employees API | ĐÃ hỗ trợ filter `managerId` (validator dòng 32) → picker chỉ cần truyền |
| Probation controller | resolveReportIds/canViewAllProbation sẵn — tái dùng cho ownership self |
| Notification | `notification.service` list/markRead; tạo row qua `notificationRepository` (pattern reminders.scan, có kind/entityType/entityId) — thêm kind `probation_self_requested` |
| Router FE | `/probation` guard probation:view (router.tsx:170) → thêm route `/probation/me` guard probation:self |
| ScorecardSheet | radiogroup + popover rubric + sub-score tái dùng được cho trang self |

## Vertical Slices

### Slice 1 — Enablers: auth/me + RBAC self + picker team-scope
**Objective:** Manager mở dialog "Tạo đánh giá" chỉ thấy direct reports đang PROBATION;
nền móng permission + contractType cho các slice sau.
**Việc:** (a) `userToDto` thêm `employee {id, contractType} | null` (+ shared AuthUserDto,
FE auth store types); (b) catalog thêm `probation:self` cho 4 system role + permission
i18n + seed RBAC; (c) picker: manager (không phải canViewAll) truyền `managerId` = employee
id của mình.
**Tests:** auth.me trả employee đúng (có/không hồ sơ NV); rbac-catalog unit cập nhật;
manual verify picker bằng preview (manager account).

### Slice 2 — BE self-eval core (schema + 3 endpoints + privacy DTO)
**Objective:** NV lưu nháp/nộp self-eval qua API; manager/HR đọc được self đã nộp; quyền
riêng tư đảm bảo.
**Việc:** migration `add_probation_self_evaluation` (selfRatings Json?, selfComment Text?,
selfSubmittedAt timestamp?); shared types (ProbationSelfReviewDto + inputs, mở rộng
ProbationReviewDto); validator; service getMine/patchSelf/submitSelf (khóa: DRAFT + chưa
nộp; submit đòi đủ tiêu chí active; ownership qua employee.userId); routes
GET /reviews/me · PATCH /:id/self · POST /:id/self/submit gate `probation:self`;
GET /reviews/me trả 404 nếu employee không PROBATION; mapper: ProbationReviewDto chỉ trả
self* khi ĐÃ nộp.
**Tests (RED trước):** ma trận đầy đủ theo spec §Testing (ownership 403, privacy assert
không lộ trường manager trong SelfReviewDto, immutability 409, incomplete 400, chặn mềm:
manager submit khi self chưa nộp vẫn 200, non-PROBATION 404).

### Checkpoint A — BE core
`pnpm --filter @hrm/api test -- probation` xanh (030/031/032 no regression); tsc/migrate sạch.

### Slice 3 — Notification "cần tự đánh giá"
**Objective:** NV nhận thông báo khi manager tạo review, click → `/probation/me`.
**Việc:** createDraft tạo notification cho user của employee chủ thể (kind
`probation_self_requested`, entityType/entityId trỏ review); FE notification deep-link
map kind → `/probation/me`; i18n title/body.
**Tests:** integration — tạo review sinh đúng 1 notification cho đúng user.

### Slice 4 — FE trang `/probation/me` (NV tự chấm)
**Objective:** NV thử việc vào nav "Tự đánh giá" → chấm 1–5 (popover rubric + nhóm
What/How + sub-score) + nhận xét → Lưu nháp / Nộp (confirm) → read-only sau nộp + step
indicator.
**Việc:** hooks (useMyProbationReview/usePatchSelf/useSubmitSelf); page + route guard
probation:self; nav item chỉ hiện khi `me.employee?.contractType === 'PROBATION'`;
empty state khi 404; i18n vi/en; tái dùng pattern radiogroup/popover từ ScorecardSheet
(extract component chung nếu gọn — không over-abstract).

### Slice 5 — FE scorecard đối chiếu self (manager/HR)
**Objective:** Manager/HR thấy step indicator 1→2→3, badge "NV: x" từng tiêu chí,
sub-score self theo nhóm, khối "Nhân viên tự nhận xét"; banner khi NV chưa nộp.
**Việc:** ProbationScorecardSheet đọc các trường self mới; step indicator component nhỏ;
i18n.

### Checkpoint B — Core complete
Luồng 3 bước chạy đúng trên preview với 3 actor (NV → manager → HR); tương thích ngược
(review cũ self*=null → banner "chưa tự đánh giá").

### Slice 6 — Polish + E2E 3 bước
**Việc:** a11y/dark/token check; E2E mở rộng probation-critical-path hoặc file mới:
NV login → /probation/me → chấm đủ + nộp → manager thấy badge self → chấm + nộp →
HR thấy đối chiếu → CONFIRM → step 3 done. Cần seed user EMPLOYEE gắn employee PROBATION
trong E2E (tạo qua form như test hiện có + login bằng tài khoản đó).

## Dependency graph

```
S1 (enablers) ── S2 (BE core) ──┬── S3 (notification)
                                ├── S4 (FE trang NV)   ──┐
                                └── S5 (FE đối chiếu)  ──┴── S6 (polish + E2E)
```

## Rủi ro & lưu ý

- **Privacy DTO là bất biến thiết kế** — SelfReviewDto build riêng (không lọc từ
  ProbationReviewDto) để không bao giờ "quên giấu" trường mới sau này.
- **Manager DTO chỉ trả self khi đã nộp** — nháp self là riêng tư.
- **Không đổi state machine** — mọi rule khóa dựa trên status + selfSubmittedAt.
- E2E cần thêm actor EMPLOYEE: tạo qua form employee như SPEC-030 test (đã có password
  field) rồi login — pattern sẵn.
- Không commit; không log selfComment.
