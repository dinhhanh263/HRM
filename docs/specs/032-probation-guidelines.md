# SPEC-032 — Probation Guidelines (Hướng dẫn đánh giá cho Manager)

> Status: **Draft (chờ xác nhận)** · Created: 2026-06-10 · Module: Probation (mở rộng SPEC-030/031)

## Objective

Thêm tab **"Hướng dẫn"** trong trang `/probation` để HR soạn và quản lý các bài hướng dẫn
đánh giá thử việc **theo từng năm**. Manager (đặc biệt là manager mới vào công ty) mở tab
là đọc được ngay cách chấm, quy trình duyệt, lưu ý của năm hiện hành — không phải hỏi HR.

## Target Users

| Role | Nhu cầu |
|------|---------|
| **HR_MANAGER / SUPER_ADMIN** | Tạo / xem / sửa / xóa guideline; tổ chức theo năm; cập nhật khi chính sách đổi |
| **MANAGER** | Đọc guideline của năm hiện tại (mặc định) hoặc năm cũ; đọc ngay trong trang đang chấm điểm |

## Quyết định phạm vi (đã chốt với user)

1. **Nội dung = văn bản có cấu trúc**: mỗi guideline gồm `title` + `content` (văn bản dài,
   giữ nguyên xuống dòng khi hiển thị — `whitespace-pre-wrap`). Không thêm thư viện
   Markdown/WYSIWYG ở iteration này.
2. **Nhiều bài / năm**: mỗi guideline gắn 1 `year`; một năm có nhiều bài (VD: "Cách chấm
   rubric", "Quy trình duyệt", "FAQ"). Filter theo năm, **mặc định năm hiện tại**.
3. **Quyền**: xem = `probation:view` (MANAGER/HR/SUPER_ADMIN — không cần permission mới);
   tạo/sửa/xóa = `probation:configure` (HR/SUPER_ADMIN). EMPLOYEE không xem (ngoài scope).
4. **Vị trí**: tab thứ 3 "Hướng dẫn" trong `/probation` (cạnh "Đánh giá" / "Tiêu chí").
   Khác tab "Tiêu chí" (chỉ hiện khi configure), tab này hiện cho **mọi probation:view**.

## Core Features

### 1. Danh sách guideline theo năm (mọi probation:view)
**Acceptance Criteria:**
- [ ] Tab "Hướng dẫn" hiện với mọi user có `probation:view`; route nằm trong `/probation`
- [ ] Select lọc theo năm — danh sách năm lấy từ dữ liệu thực có (distinct years) + năm
      hiện tại; mặc định chọn **năm hiện tại**
- [ ] Mỗi guideline render dạng card: `title` (heading) + `content` (`whitespace-pre-wrap`,
      đọc được xuống dòng/danh sách gõ tay) + meta (năm, cập nhật lúc nào)
- [ ] Sắp xếp: `order` tăng dần rồi `createdAt`; Empty state khi năm chưa có bài (icon +
      mô tả; CTA "Thêm hướng dẫn" chỉ hiện khi có `probation:configure`)
- [ ] Skeleton khi load; lỗi → toast

### 2. HR CRUD guideline (probation:configure)
**Acceptance Criteria:**
- [ ] Nút "Thêm hướng dẫn" + actions Sửa/Xóa trên từng card — chỉ render khi
      `probation:configure` (RBAC server-side vẫn là chốt chặn thật)
- [ ] Form tạo/sửa trong **Sheet** (form có textarea dài — theo rule "Sheet cho edit
      forms" của CLAUDE.md): `title` (bắt buộc, ≤200), `year` (bắt buộc, 2000–2100,
      mặc định năm hiện tại), `content` (bắt buộc, ≤20.000), `order` (mặc định 0)
- [ ] Validation Zod cả FE (RHF) lẫn BE; lỗi hiện inline dưới field
- [ ] Xóa qua AlertDialog xác nhận (xóa cứng — guideline không bị tham chiếu bởi entity khác)
- [ ] Toast thành công/thất bại; invalidate query sau mutation

### 2b. Nội dung hỗ trợ bảng (bổ sung 2026-06-10 theo yêu cầu user)
**Acceptance Criteria:**
- [ ] Trong `content`, **từ 2 dòng liên tiếp trở lên** chứa ` | ` được render thành **bảng**
      (dòng đầu là header) bằng component Table của design system; các dòng khác vẫn là
      đoạn văn `whitespace-pre-wrap`
- [ ] 1 dòng đơn lẻ chứa ` | ` KHÔNG thành bảng (tránh bảng vô tình từ câu văn thường)
- [ ] Parser là pure function có unit test; không thêm thư viện markdown
- [ ] Placeholder form gợi ý cú pháp bảng

### 2c. Nội dung theo ngôn ngữ (bổ sung 2026-06-11 theo yêu cầu user)
**Acceptance Criteria:**
- [ ] `ProbationGuideline` thêm `language` ∈ {`vi`, `en`} (String, default `vi` — bài cũ
      tự thành `vi` qua migration)
- [ ] GET hỗ trợ `?language=`; **không truyền = trả tất cả** (tương thích ngược)
- [ ] Tab Hướng dẫn **tự lọc theo ngôn ngữ UI đang chọn** (i18n.language) — đổi VI↔EN
      là danh sách đổi theo, không cần reload
- [ ] Form tạo/sửa có select Ngôn ngữ (mặc định = ngôn ngữ UI hiện tại; sửa thì prefill)
- [ ] Validator BE: language enum, 422 nếu giá trị lạ
- [ ] Dữ liệu: 5 bài khung năng lực có đủ bản VI lẫn EN (bản EN dùng nguyên văn tiếng Anh
      từ file Excel gốc)

### 3. RBAC server-side
**Acceptance Criteria:**
- [ ] `GET /probation/guidelines` → `requirePermission('probation:view')`
- [ ] `POST/PATCH/DELETE /probation/guidelines[/:id]` → `requirePermission('probation:configure')`
- [ ] MANAGER gọi POST/PATCH/DELETE → 403; EMPLOYEE gọi GET → 403; không token → 401
- [ ] Mọi query scope theo `tenantId` (multi-tenant — không đọc/ghi chéo tenant)

## Out of Scope

- Markdown/WYSIWYG editor, file đính kèm, hình ảnh
- Versioning/audit lịch sử sửa đổi nội dung
- Guideline cho module khác (recruitment, payroll…) — bảng đặt tên riêng cho probation
- EMPLOYEE xem guideline
- Thông báo/reminder khi guideline mới được đăng

## Technical Approach

### Data model (Prisma — 1 bảng mới)

```prisma
// Bài hướng dẫn đánh giá thử việc cho manager, do HR soạn, gắn theo năm áp dụng.
model ProbationGuideline {
  id        String   @id @default(cuid())
  tenantId  String   @map("tenant_id")
  year      Int
  title     String
  content   String   @db.Text
  order     Int      @default(0)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, year])
  @@map("probation_guidelines")
}
```

### Shared types (`packages/shared/src/types/probation.ts`)

```ts
export interface ProbationGuidelineDto {
  id: string; tenantId: string; year: number; title: string; content: string;
  order: number; createdAt: string; updatedAt: string;
}
export interface CreateProbationGuidelineInput {
  year: number; title: string; content: string; order?: number;
}
export interface UpdateProbationGuidelineInput {
  year?: number; title?: string; content?: string; order?: number;
}
export interface ProbationGuidelineListParams { year?: number; }
```

### API (REST, theo api-conventions)

| Method & Path | Permission | Ghi chú |
|---|---|---|
| GET `/api/v1/probation/guidelines?year=2026` | `probation:view` | Trả mảng + đủ để FE build danh sách năm (GET không year = tất cả) |
| POST `/api/v1/probation/guidelines` | `probation:configure` | 201 |
| PATCH `/api/v1/probation/guidelines/:id` | `probation:configure` | 200; 404 nếu khác tenant/không tồn tại |
| DELETE `/api/v1/probation/guidelines/:id` | `probation:configure` | 204 |

Layer: routes → `probation.controller` → `probation-guideline.service` →
`probation-guideline.repository` (mirror cấu trúc criteria hiện có). Validator Zod:
`year` int 2000–2100, `title` 1–200, `content` 1–20000, `order` ≥0.

### Frontend

- `ProbationPage.tsx`: thêm `Tab = 'guidelines'`, hiện cho mọi user (đã qua route guard
  `probation:view`); tab "Tiêu chí" giữ nguyên điều kiện configure.
- Component mới `ProbationGuidelines.tsx` (features/probation/components): year Select +
  cards + empty/skeleton; Sheet form (RHF + Zod) cho create/edit; AlertDialog xóa.
- Hooks TanStack Query mới trong `useProbation.ts`: `useProbationGuidelines(year?)`,
  `useCreate/Update/DeleteProbationGuideline` (mirror pattern criteria, `staleTime` 30s,
  invalidate theo key `probationKeys`).
- i18n: thêm namespace keys `guidelines.*` vào `vi/probation.json` + `en/probation.json`.
- Design system: token-only, dark mode, `tabular-nums` cho năm, a11y (label/htmlFor,
  aria-label cho icon buttons), skeleton-not-spinner.

## Testing Strategy

- **Integration (API)**: CRUD đầy đủ + RBAC ma trận (HR 2xx; MANAGER GET 200 nhưng
  POST/PATCH/DELETE 403; không token 401; cross-tenant 404) + filter `?year=` đúng +
  validation 422 (title rỗng, year ngoài khoảng, content quá dài).
- **E2E (critical path, business outcome)**: HR tạo guideline cho năm hiện tại qua UI
  → đăng nhập lại không cần (1 actor admin) → tab "Hướng dẫn" hiển thị đúng title +
  content; sửa title → thấy thay đổi; xóa → empty state. Assert điều manager thực sự
  nhìn thấy, không assert coverage.
- **Unit**: validator (biên year/length) nếu logic đáng kể; không viết test vô nghĩa.

## Boundaries

### Always Do
- RBAC `requirePermission` ở **mọi** route mới (non-negotiable)
- Scope `tenantId` ở mọi truy vấn
- Follow `.claude/rules/*` + design tokens (no hex, no inline style)
- TDD: integration test RED trước khi viết route/service

### Ask First
- Thêm thư viện mới (không dự kiến cần)
- Mở rộng quyền xem cho EMPLOYEE

### Never Do
- Permission key mới khi `probation:view/configure` đã đủ ngữ nghĩa
- Commit (user làm việc local, không có kế hoạch commit)
- Log nội dung guideline kèm PII vào structured log
