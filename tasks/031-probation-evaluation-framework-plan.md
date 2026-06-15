# PLAN: SPEC-031 — Probation Evaluation Framework

> Spec: `docs/specs/031-probation-evaluation-framework.md`
> Mở rộng trực tiếp SPEC-030 (Probation Review). Tuân thủ `/build` (TDD: RED→GREEN→REFACTOR).

## Context & nguyên tắc

Tích hợp **khung năng lực BARS** vào flow review thử việc làm "bản hướng dẫn Manager":
1. **Rubric 5 mức/tiêu chí** + popover hướng dẫn tại scorecard.
2. **Seed 6 năng lực hiện đại** (big-tech 2025–2026) + trường **`group`** (PERFORMANCE/VALUES).
3. **Sub-score What/How** (trung bình theo nhóm) — chỉ hiển thị.
4. **Deliverable evidence log** trên review, bất biến sau submit.

**Bất biến (không phá vỡ SPEC-030):** thang điểm 1–5, status machine, decide side-effects,
immutability sau submit, RBAC server-side. Chỉ **thêm 3 cột Json/String nullable-or-default**
(`group`, `rubric` trên criteria; `deliverables` trên review), **không bảng mới, không endpoint mới**.

## Bề mặt code (đã khảo sát)

| Layer | File |
|-------|------|
| Shared types | `packages/shared/src/types/probation.ts` |
| Schema | `apps/api/prisma/schema.prisma` (model ProbationCriteria ~L1010, ProbationReview ~L1025) |
| Seed defaults | `apps/api/src/domain/probation/defaults.ts` |
| Mappers | `apps/api/src/domain/probation/mappers.ts` |
| Validator | `apps/api/src/app/validators/probation.validator.ts` |
| Criteria service | `apps/api/src/domain/services/probation-criteria.service.ts` |
| Review service | `apps/api/src/domain/services/probation-review.service.ts` |
| Criteria repo | `apps/api/src/domain/repositories/probation-criteria.repository.ts` |
| FE hooks | `apps/web/src/features/probation/hooks/useProbation.ts` (pass-through, ít/không sửa) |
| FE scorecard | `apps/web/src/features/probation/components/ProbationScorecardSheet.tsx` |
| FE settings | `apps/web/src/features/probation/components/ProbationCriteriaSettings.tsx` |
| i18n | `apps/web/src/locales/{vi,en}/probation.json` |
| E2E | `apps/web/e2e/probation-critical-path.spec.ts` |

---

## Slices (đánh số, có thứ tự phụ thuộc)

### Slice 1 — Foundation: schema + shared types + migration
**Objective:** Có chỗ lưu `group`/`rubric`/`deliverables` và type chia sẻ, build/migrate sạch.

**Files:**
- `apps/api/prisma/schema.prisma` — ProbationCriteria: `group String @default("PERFORMANCE")`, `rubric Json?`; ProbationReview: `deliverables Json?`
- `packages/shared/src/types/probation.ts` — thêm `ProbationCompetencyGroup`, `ProbationRubricLevel`, `ProbationDeliverable`, `ProbationDeliverableOutcome`; thêm `group`+`rubric?` vào `ProbationCriteriaDto`/Create/Update; `deliverables` vào `ProbationReviewDto`; `deliverables?` vào Patch/Submit input
- Prisma migration `add_probation_framework_fields`

**Acceptance:**
- [ ] `pnpm --filter @hrm/shared build` + `pnpm --filter @hrm/api build` (tsc) sạch
- [ ] `prisma migrate dev` tạo migration `ADD COLUMN` (group có DEFAULT backfill); `prisma generate` sạch
- [ ] Test hiện có của probation **vẫn xanh** (no regression)

**Dependencies:** none.

---

### Slice 2 — Seed 6 năng lực + group + rubric tiếng Việt
**Objective:** Tenant mới được seed 6 năng lực hiện đại kèm rubric BARS Việt hóa.

**Files:**
- `apps/api/src/domain/probation/defaults.ts` — `DEFAULT_PROBATION_CRITERIA` = 6 mục `{ name, order, group, rubric[5] }`; `createMany` map đủ `group`+`rubric`

**Nội dung 6 năng lực** (mỗi mục 5 mức 1→5, definition + observable):
1. Chuyên môn & Tốc độ hòa nhập — PERFORMANCE
2. Chất lượng công việc — PERFORMANCE
3. Chủ động & Sở hữu công việc — PERFORMANCE
4. Giao tiếp & Phối hợp — PERFORMANCE
5. Thích nghi & Học hỏi — PERFORMANCE
6. Phù hợp văn hóa & Giá trị — VALUES

**Acceptance:**
- [ ] Unit test: `seedProbationCriteriaForTenant` tạo đúng 6 tiêu chí với `group`+`rubric` (5 mức/score 1..5) cho tenant rỗng
- [ ] Idempotent: gọi lần 2 không tạo thêm; tenant đã có tiêu chí **không** bị đụng

**Dependencies:** Slice 1.

---

### Slice 3 — BE: rubric + group trên criteria (validator + service + mapper + repo)
**Objective:** API criteria nhận/lưu/trả `group`+`rubric` hợp lệ.

**Files:**
- `apps/api/src/app/validators/probation.validator.ts` — `rubricSchema` (array đúng 5, `score` 1..5 **không trùng**, `level` ≤120 bắt buộc, `definition`/`observable` ≤2000 optional); `group` Zod enum vào create/update criteria (optional, default PERFORMANCE)
- `apps/api/src/domain/services/probation-criteria.service.ts` — create/update persist `group`+`rubric` (rubric rỗng/null → `Prisma.DbNull`)
- `apps/api/src/domain/probation/mappers.ts` — `toProbationCriteriaDto` trả `group`+`rubric`
- `apps/api/src/domain/repositories/probation-criteria.repository.ts` — create/update pass-through các field mới (orderBy giữ nguyên)

**Acceptance:**
- [ ] Test validator: rubric 4 mức → fail; score trùng → fail; 5 mức hợp lệ → pass; group sai → fail
- [ ] Test service: tạo tiêu chí có rubric+group rồi đọc lại đúng; update rubric=null xóa hướng dẫn
- [ ] GET `/criteria` trả `group`+`rubric`

**Dependencies:** Slice 1.

---

### Slice 4 — BE: deliverables trên review (validator + service + mapper, immutable sau submit)
**Objective:** Manager lưu danh sách bằng chứng ở patch/submit; bất biến sau submit.

**Files:**
- `apps/api/src/app/validators/probation.validator.ts` — `deliverablesSchema` (array ≤50; `title` ≤200 bắt buộc; `link` `.url()` ≤500 optional/nullable; `outcome` enum MET/EXCEEDED/NOT_MET optional; `note` ≤1000 optional) vào patch + submit
- `apps/api/src/domain/services/probation-review.service.ts` — patch: lưu `deliverables` khi DRAFT; submit: lưu kèm; **không** cho sửa khi không DRAFT (đi qua `requireEditableDraft` sẵn có)
- `apps/api/src/domain/probation/mappers.ts` — `toProbationReviewDto` trả `deliverables`

**Acceptance:**
- [ ] Test validator: link không hợp lệ → fail; title rỗng → fail; >50 mục → fail; hợp lệ → pass
- [ ] Test service: patch DRAFT lưu deliverables; submit lưu kèm; patch sau PENDING_HR → ConflictError (immutable)
- [ ] GET `/reviews/:id` trả `deliverables`

**Dependencies:** Slice 1.

---

## Checkpoint A — Backend complete
- [ ] `pnpm --filter @hrm/api test -- probation` xanh (cần DB chạy)
- [ ] build/tsc/migrate sạch; RBAC + immutability không đổi; no regression SPEC-030

---

### Slice 5 — FE: popover hướng dẫn rubric + sub-score What/How
**Objective:** Manager chấm có hướng dẫn BARS tại chỗ; thấy điểm Hiệu suất/Giá trị tách riêng.

**Files:**
- `apps/web/src/features/probation/components/ProbationScorecardSheet.tsx` — mỗi tiêu chí có rubric: nút **"Hướng dẫn"** (Popover Radix) liệt kê 5 mức, **tô đậm mức = điểm đang chọn** (token primary); nhóm tiêu chí theo `group` (mục "Hiệu suất"/"Giá trị") + hiển thị **trung bình mỗi nhóm** (`tabular-nums`, 1 chữ số). Tiêu chí không rubric → ẩn nút.
- `apps/web/src/locales/{vi,en}/probation.json` — khóa rubric/group/sub-score

**Acceptance:**
- [ ] Popover hiện 5 mức, highlight đúng mức đang chọn; tiêu chí không rubric không có nút
- [ ] Sub-score Hiệu suất/Giá trị tính đúng (chỉ tiêu chí đã chấm); không chặn submit
- [ ] Screenshot light + dark; a11y (focus trap, Esc, aria-label)

**Dependencies:** Slice 3.

---

### Slice 6 — FE: trình soạn deliverable evidence
**Objective:** Manager thêm/xóa dòng bằng chứng (title, link, outcome, note) khi DRAFT; read-only sau submit; HR mở link.

**Files:**
- `apps/web/src/features/probation/components/ProbationScorecardSheet.tsx` — khu vực "Bằng chứng công việc": add/remove row khi `editable`; read-only khi PENDING_HR/DECIDED; link `target=_blank rel=noopener noreferrer`. Đưa `deliverables` vào payload patch/submit.
- i18n keys

**Acceptance:**
- [ ] DRAFT: thêm/xóa dòng, validate link client (RHF/Zod); submit gửi kèm
- [ ] PENDING_HR/DECIDED: chỉ đọc, link mở tab mới
- [ ] Screenshot light + dark

**Dependencies:** Slice 4, Slice 5.

---

### Slice 7 — FE: soạn rubric + chọn group trong tab cấu hình tiêu chí
**Objective:** HR soạn rubric 5 mức + chọn nhóm cho từng tiêu chí.

**Files:**
- `apps/web/src/features/probation/components/ProbationCriteriaSettings.tsx` — Dialog thêm **chọn group** (Hiệu suất/Giá trị) + **editor rubric 5 hàng** (nhãn + định nghĩa + biểu hiện); rubric rỗng → gửi `null`. Schema RHF/Zod mở rộng.
- i18n keys

**Acceptance:**
- [ ] Tạo/sửa tiêu chí kèm group + rubric; bỏ trống rubric → không hướng dẫn
- [ ] Gate `probation:configure`; screenshot light + dark

**Dependencies:** Slice 3.

---

## Checkpoint B — Core complete
- [ ] Luồng đầy đủ: HR soạn rubric+group → Manager chấm có popover + sub-score + deliverable → nộp → HR đọc thấy deliverable/link
- [ ] Tương thích ngược: tiêu chí không rubric & review cũ (deliverables=null) vẫn chạy

---

### Slice 8 — Polish + E2E critical path
**Objective:** Hoàn thiện a11y/dark/i18n và chứng minh nghiệp vụ bằng E2E.

**Files:**
- Rà `apps/web/src/features/probation/**` (token no-hex, tabular-nums, reduced-motion, aria)
- `apps/web/src/locales/{vi,en}/probation.json` — đủ vi+en
- `apps/web/e2e/probation-critical-path.spec.ts` — mở rộng: Manager mở popover hướng dẫn → chấm theo rubric → thêm 1 deliverable có link → nộp → HR mở review **assert thấy deliverable + link**

**Acceptance:**
- [ ] E2E xanh trên stack live (web:5173 + api:5000)
- [ ] Checklist UI-modern (calm, token, motion, depth, a11y, i18n) pass
- [ ] Cập nhật `tasks/031-...-todo.md`

**Dependencies:** Slice 5, 6, 7.

---

## Thứ tự phụ thuộc (tóm tắt)

```
Slice 1 (foundation)
  ├─ Slice 2 (seed)
  ├─ Slice 3 (BE criteria rubric+group) ── Slice 5 (FE popover+sub-score) ─┐
  │                                     └─ Slice 7 (FE settings)           ├─ Slice 8 (polish+E2E)
  └─ Slice 4 (BE deliverables) ───────────  Slice 6 (FE deliverable editor)┘
```

## Rủi ro & lưu ý
- **Prisma Json null:** dùng `Prisma.DbNull` khi xóa rubric/deliverables (không phải `null`), bám pattern `ratings` sẵn có.
- **Tương thích ngược:** rubric/deliverables optional; `group` có DEFAULT — review/criteria cũ không vỡ.
- **Sub-score chỉ hiển thị:** tuyệt đối không dùng để chặn submit hay đổi quyết định HR.
- **Không tự migrate tiêu chí tenant cũ** khi đổi seed (chỉ tác động tenant seed lần đầu).
- **TDD:** mỗi slice BE viết test RED trước; FE verify bằng screenshot + E2E ở Slice 8 (assert nghiệp vụ, không quote coverage).
