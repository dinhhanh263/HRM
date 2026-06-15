# TODO: SPEC-032 — Probation Guidelines

> Plan: `tasks/032-probation-guidelines-plan.md` · Spec: `docs/specs/032-probation-guidelines.md`

## Phase 1: Read path
- [x] Slice 1 — Manager đọc guideline theo năm: model `ProbationGuideline` + migration + shared types + GET (RBAC view, filter year, scope tenant) + tab "Hướng dẫn" + danh sách card (year select mặc định năm nay, skeleton, empty state)

## Phase 2: HR quản trị
- [x] Slice 2 — HR tạo guideline: POST (configure) + Sheet form RHF/Zod (title/year/content/order)
- [x] Slice 3 — HR sửa/xóa: PATCH + DELETE (404 cross-tenant) + Sheet edit prefill + AlertDialog xóa

### Checkpoint A — Core complete
- [x] `pnpm --filter @hrm/api test -- probation` xanh 88/88 (030/031 no regression); tsc/build 2 app sạch; verify preview: HR tạo + sửa thành công, content giữ xuống dòng, 0 console error

## Phase 2c: Nội dung theo ngôn ngữ (2026-06-11, theo yêu cầu user)
- [x] `language` (vi|en, default vi) trên ProbationGuideline + migration; GET `?language=` (không truyền = tất cả); tab lọc theo ngôn ngữ UI (đổi VI↔EN là nội dung đổi theo, verify trên preview); form có select ngôn ngữ (default = ngôn ngữ UI, prefill khi sửa); 6 test BE mới (filter/default/422); 5 bài có đủ bản VI + EN (bản EN nguyên văn từ Excel gốc) — 98/98 test probation xanh

## Phase 2b: Bổ sung theo yêu cầu user (2026-06-10)
- [x] Nội dung hỗ trợ bảng (spec §2b): parser pure function (≥2 dòng liên tiếp có ` | ` = bảng, 1 dòng đơn lẻ vẫn là đoạn văn) + render bằng Table component + placeholder gợi ý cú pháp — unit test 6/6; 5 bài framework đã chuyển sang dạng bảng qua API

## Phase 3: Polish & Integration
- [x] Slice 4 — Polish (a11y, dark mode, tabular-nums, i18n vi+en) + E2E `probation-guidelines.spec.ts` xanh (tạo→hiển thị đúng 2 dòng content→sửa→xóa biến mất); full api suite 1148/1148
