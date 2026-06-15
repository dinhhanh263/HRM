# Plan: SPEC-032 — Probation Guidelines

> Spec: `docs/specs/032-probation-guidelines.md` · Created: 2026-06-10
> Mở rộng module Probation (SPEC-030/031). 1 bảng mới, 4 endpoint, 1 tab + 1 component FE.

## Bối cảnh codebase (đã khảo sát)

| Integration point | File | Ghi chú |
|---|---|---|
| Routes | `apps/api/src/app/routes/v1/probation.routes.ts` | Thêm section `---- Guidelines ----` (mirror criteria) |
| Controller | `apps/api/src/app/controllers/probation.controller.ts` (181 dòng) | Thêm 4 handler vào cùng controller (đủ nhỏ, cùng domain) |
| Service/Repo | mới: `probation-guideline.service.ts` + `probation-guideline.repository.ts` | Mirror `probation-criteria.*` |
| Validator | `apps/api/src/app/validators/probation.validator.ts` | Thêm create/update/listQuery schemas |
| Mapper | `apps/api/src/domain/probation/mappers.ts` | `toProbationGuidelineDto` |
| Shared types | `packages/shared/src/types/probation.ts` | DTO + inputs + params |
| FE page tabs | `apps/web/src/features/probation/pages/ProbationPage.tsx` | `Tab = 'reviews' \| 'criteria' \| 'guidelines'`; guidelines show: true |
| FE hooks | `apps/web/src/features/probation/hooks/useProbation.ts` | `probationKeys.guidelines(year?)` + 4 hooks |
| FE component | mới: `ProbationGuidelines.tsx` | Year select + cards + Sheet form + AlertDialog |
| i18n | `apps/web/src/i18n/locales/{vi,en}/probation.json` | namespace `guidelines.*` |
| E2E | `apps/web/e2e/probation-guidelines.spec.ts` (file mới) | Critical path CRUD qua UI |

Pattern phải theo: layered routes→controller→service→repository; Zod 2 đầu; TanStack Query
với `probationKeys`; Sheet cho edit form; AlertDialog cho xóa; token-only styling.

## Vertical Slices

### Slice 1 — Manager đọc guideline theo năm (read path end-to-end)
**Objective:** Người có `probation:view` mở tab "Hướng dẫn", lọc theo năm, đọc nội dung.
**Files:** schema.prisma (+migration `add_probation_guidelines`), shared types, mappers,
validator (listQuery), repository (findAll + distinctYears), service (getAll), controller
(listGuidelines), routes (GET), useProbation.ts (keys + useProbationGuidelines),
ProbationPage.tsx (tab 3), ProbationGuidelines.tsx (read-only: year select + cards +
skeleton + empty state), i18n.
**Tests (RED trước):** integration GET — 200 cho HR + MANAGER, 401 không token, 403
EMPLOYEE, filter `?year=`, scope tenant (cross-tenant không thấy), sort order→createdAt.
**AC:** spec §1 (trừ CTA thêm — slice 2). Build/tsc/migrate sạch.

### Slice 2 — HR tạo guideline (create path)
**Objective:** HR bấm "Thêm hướng dẫn" → Sheet form → bài mới hiện trong danh sách đúng năm.
**Files:** validator (createSchema), service (create), controller + routes (POST),
hooks (useCreateProbationGuideline), ProbationGuidelines.tsx (nút thêm gate Can +
Sheet form RHF/Zod: title/year/content/order, default year = năm hiện tại), i18n.
**Tests:** integration POST — 201 HR (body đúng DTO), 403 MANAGER, 422 (title rỗng /
year 1999 / content >20k), tenant tự gán từ token.
**AC:** spec §2 phần tạo + §3 RBAC cho POST.

### Slice 3 — HR sửa + xóa guideline
**Objective:** HR sửa nội dung bài cũ (đổi cả năm nếu cần), xóa bài lỗi thời qua confirm.
**Files:** validator (updateSchema), service (update/remove — NotFound nếu khác tenant),
controller + routes (PATCH/DELETE), hooks (useUpdate/useDelete), ProbationGuidelines.tsx
(actions Sửa/Xóa trên card gate Can + Sheet edit prefill + AlertDialog), i18n.
**Tests:** integration PATCH/DELETE — 200/204 HR, 403 MANAGER, 404 id lạ + 404 cross-tenant,
422 update không hợp lệ; sau DELETE bài biến mất khỏi GET.
**AC:** spec §2 phần sửa/xóa + §3 RBAC đầy đủ.

### Checkpoint A — Core complete
`pnpm --filter @hrm/api test -- probation` xanh (kèm 030/031 không regression);
tsc + build cả 2 app sạch; verify nhanh trên preview (HR tạo→sửa→xóa, manager nhìn thấy).

### Slice 4 — Polish + E2E critical path
**Objective:** Chốt chất lượng UI + bằng chứng E2E.
**Việc:** a11y (label/htmlFor, aria-label icon buttons, focus-visible), dark mode
screenshot, `tabular-nums` cho năm, empty state CTA đúng quyền, i18n vi+en đối chiếu đủ
key, reduced-motion ok (dùng token động sẵn có).
**E2E (`probation-guidelines.spec.ts`):** admin tạo guideline năm hiện tại qua UI →
card hiện đúng title+content (xuống dòng giữ nguyên) → sửa title → thấy bản mới →
xóa → empty state. 1 actor, business outcome.
**AC:** checklist CLAUDE.md + ui-modern trước commit.

## Dependency graph

```
S1 (read path + schema) ── S2 (create) ── S3 (update/delete) ── Checkpoint A ── S4 (polish + E2E)
```

Tuần tự đơn giản — mỗi slice phụ thuộc slice trước (S2 cần model+tab của S1; S3 cần form
Sheet của S2 để tái dùng cho edit).

## Rủi ro & lưu ý

- **Tab "Tiêu chí" hiện gate configure** — thêm tab guidelines show:true cho mọi
  probation:view, KHÔNG đổi điều kiện tab cũ.
- **Danh sách năm cho Select**: lấy distinct years từ data + luôn chèn năm hiện tại
  (kể cả chưa có bài) — tránh select rỗng lần đầu.
- **Content dài**: `@db.Text` (không varchar mặc định); FE textarea rows lớn + maxLength.
- **Không permission key mới** — đã chốt trong spec (Never Do).
- **Không commit** (quy ước user).
