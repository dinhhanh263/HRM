# SPEC-026: Asset Bulk Import (Mass Onboarding of Fixed Assets)

**Status:** Draft
**Created:** 2026-06-07
**Author:** Claude + Hạnh
**Depends on:** SPEC-003 (RBAC), SPEC-021 (Fixed Assets Management), SPEC-006 (Employee Bulk Import — reference pattern)

---

## Objective

Cho phép HR Manager nhập một lượng lớn tài sản vào tenant trong một thao tác
self-service bằng cách upload file Excel/CSV — với bước **validate-before-commit**
(preview + báo lỗi từng dòng) và commit theo **transaction "tất cả hoặc không"**,
để việc khởi tạo dữ liệu lúc triển khai hệ thống không cần kỹ sư và không bao giờ
ghi nửa chừng một lô dữ liệu hỏng.

## Target Users

| User | Quyền |
|------|-------|
| **Super Admin** | Import tài sản vào bất kỳ tenant nào |
| **HR Manager** | Import tài sản trong tenant của mình |
| **Manager** | ❌ Không truy cập |
| **Employee** | ❌ Không truy cập |

Chặn server-side bằng permission mới **`assets:import`** (thêm vào nhóm `assets`
trong `packages/shared/src/types/rbac.ts`). Mọi thao tác đều tenant-scoped.

---

## Product Decisions (đã chốt)

| Quyết định | Lựa chọn |
|------------|----------|
| **Định dạng file** | **Cả `.xlsx` và `.csv`.** Template `.xlsx` có dropdown cho `category`, `condition`; kèm biến thể `.csv`. |
| **Bước preview** | **Có preview bắt buộc** — upload → bảng preview + đánh dấu lỗi từng dòng → xác nhận mới import. |
| **Xử lý lỗi** | **Tất cả hoặc không (atomic).** Chỉ cho phép import khi **0 dòng lỗi**; commit trong một `prisma.$transaction`. Bất kỳ lỗi nào ở thời điểm commit (vd. mã trùng do race) → rollback toàn bộ. |
| **Category không tồn tại** | **Báo lỗi** (`IMPORT_CATEGORY_NOT_FOUND`). Category phải được tạo trước (màn Cài đặt tài sản). *Không* auto-create ở v1. |
| **Owner (người sở hữu) không tồn tại** | **Báo lỗi** (`IMPORT_OWNER_NOT_FOUND`). Cột owner là tùy chọn; nếu có → tạo `AssetAssignment` (status `ASSIGNED`). |

> **Lưu ý mô hình dữ liệu:** `Asset` **không có** trường "phòng ban". Tài sản thuộc
> về một **AssetCategory** (bắt buộc) và có thể được gán cho một **người sở hữu**
> (Employee) qua `AssetAssignment`. "Phòng ban" mà người dùng nhắc đến được map sang
> tham chiếu **category**; "người sở hữu" map sang cột **owner** (tùy chọn).

---

## Core Features

### 1. Download Template
**Acceptance Criteria:**
- [ ] `GET /assets/import/template?format=xlsx|csv` trả về template đã localize (header vi/en)
- [ ] `.xlsx` template có: hàng header, 1–2 dòng ví dụ, dropdown data-validation cho `category` (liệt kê category code hiện có của tenant) và `condition`
- [ ] Template ghi rõ cột bắt buộc vs tùy chọn và định dạng được chấp nhận (ngày = `YYYY-MM-DD`)

**Columns:**

| Column | Required | Notes |
|--------|----------|-------|
| `assetCode` | ✅ | Unique per tenant; UPPERCASE chữ-số-`-`-`_` (regex `^[A-Z0-9_-]+$`, max 50) |
| `name` | ✅ | max 150 |
| `category` | ✅ | **Theo `code`** của AssetCategory (vd. "LAPTOP"), không phải id; phải tồn tại |
| `serialNumber` | ❌ | max 120 |
| `brand` | ❌ | max 80 |
| `model` | ❌ | max 80 |
| `condition` | ❌ | `NEW`/`GOOD`/`FAIR`/`POOR` |
| `purchaseDate` | ❌ | `YYYY-MM-DD` |
| `purchaseCost` | ❌ | số ≥ 0 (VND), ≤ 1e12 |
| `warrantyEndDate` | ❌ | `YYYY-MM-DD` |
| `vendor` | ❌ | max 120 |
| `location` | ❌ | max 120 (text tự do) |
| `note` | ❌ | max 1000 |
| `owner` | ❌ | Email **hoặc** mã nhân viên của người sở hữu; nếu có → tạo assignment `ASSIGNED` |
| `assignedAt` | ❌ | `YYYY-MM-DD`, bắt buộc nếu có `owner` (mặc định hôm nay) |

### 2. Upload + Dry-Run Validation (không ghi DB)
**Acceptance Criteria:**
- [ ] `POST /assets/import/validate` nhận multipart file, parse toàn bộ dòng
- [ ] Trả về summary: `{ importId, totalRows, validCount, errorCount, rows: [{ row, data, errors: [{ column, code, message }] }] }` để render bảng preview
- [ ] Validate mỗi dòng: required fields, regex `assetCode`, format ngày, enum `condition`, `purchaseCost` số hợp lệ; `assetCode` unique **trong file** và **so với DB**; `category` code phải resolve được; `owner` (nếu có) phải resolve được tới Employee trong tenant
- [ ] File-level guards: max rows (mặc định **2.000**), max size (5 MB), allowed mime types (xlsx/csv)
- [ ] **Không** tạo bất kỳ `Asset`/`AssetAssignment` nào trong lúc validate
- [ ] Stage dữ liệu đã parse server-side (Redis, key theo `importId`, TTL ngắn vd. 30 phút) để bước confirm dùng lại — không re-upload file
- [ ] Error dùng machine code ổn định + i18n vi/en

### 3. Confirm + Atomic Import (tất cả hoặc không)
**Acceptance Criteria:**
- [ ] `POST /assets/import` nhận `{ importId }`; chỉ chạy khi staged data có `errorCount === 0`
- [ ] **Re-validate** ngay trước khi ghi (chống race: mã bị tạo giữa validate và confirm) — nếu phát sinh lỗi → trả 409, **không ghi gì**
- [ ] Toàn bộ insert nằm trong **một** `prisma.$transaction`: tạo tất cả `Asset`, và với dòng có `owner` → tạo `AssetAssignment` (status `ASSIGNED`, `ackStatus=PENDING`) + set `asset.status=ASSIGNED`
- [ ] Bất kỳ lỗi nào trong transaction → rollback toàn bộ, trả `{ success:false }` + lý do; **không có** asset nào được tạo
- [ ] Thành công → trả `{ created, assignmentsCreated }` và clear staged data
- [ ] Đồng bộ (blocking) trong giới hạn 2.000 dòng; đặt `statement_timeout`/transaction timeout hợp lý

### 4. Frontend (Assets page)
**Acceptance Criteria:**
- [ ] Nút "Import" trên toolbar danh sách tài sản (chỉ hiện với `assets:import` qua `<Can>`)
- [ ] Wizard trong `Sheet`/stepped dialog: (1) Tải template → (2) Upload → (3) Preview + bảng lỗi → (4) Xác nhận → (5) Kết quả
- [ ] Bước preview render bảng dữ liệu với header "Hợp lệ: N / Lỗi: M"; **nút Import bị disable khi M > 0**; mỗi dòng lỗi hiển thị rõ cột + thông báo
- [ ] Light + dark mode, vi + en i18n, skeleton/empty/error states, chỉ dùng design token
- [ ] Sau import thành công → toast + invalidate `assetKeys.lists()`; đóng wizard

---

## Out of Scope (iteration này)

- Bulk **update / dispose / return** qua file (spec này chỉ tạo mới)
- Auto-create AssetCategory khi import (phải tạo trước)
- Import lịch sử maintenance, biên bản bàn giao có chữ ký
- Upload ảnh tài sản hàng loạt
- Import bất đồng bộ qua queue (asset import là đồng bộ, bounded ≤ 2.000 dòng)
- Scheduled/recurring imports, API/SCIM sync

---

## Technical Approach

### Reuse (bám code hiện có)
- **Parser & upload middleware:** tái sử dụng `upload.middleware.ts` (multer memory, mime check) và reader xlsx/csv đã có ở employee import (`employee-import.controller.ts`).
- **RBAC:** thêm `'import'` vào mảng `assets` trong `packages/shared/src/types/rbac.ts`; `seedPermissionCatalog()` + `syncSystemRolesForTenant()` tự cấp `assets:import` cho SUPER_ADMIN & HR_MANAGER (cập nhật danh sách role HR_MANAGER trong `catalog.ts`).
- **Validator:** mở rộng `asset.validator.ts` với `importRowSchema` (reuse `assetCode`, `conditionEnum`, `dateInput`, `purchaseCost`).
- **Frontend:** mirror `EmployeeImportWizard.tsx` + `useEmployeeImport.ts`; thêm `useAssetImport.ts` (`useImportTemplate`, `useValidateImport`, `useConfirmImport`).

### API contracts
```
GET    /api/v1/assets/import/template?format=xlsx|csv   -> file download
POST   /api/v1/assets/import/validate  (multipart)      -> { importId, totalRows, validCount, errorCount, rows[] }
POST   /api/v1/assets/import           (json { importId }) -> { created, assignmentsCreated } | 409 { errors[] }
```
Tất cả dưới auth + `requirePermission('assets:import')`, tenant-scoped.

### Data flow
```
Template ─► HR điền ─► /validate (parse, dry-run, stage→Redis) ─► bảng preview + lỗi
                                   │ errorCount === 0
                                   ▼
        /import { importId } ─► re-validate ─► prisma.$transaction:
            tạo tất cả Asset; với owner → AssetAssignment(ASSIGNED) + asset.status=ASSIGNED
                                   ▼ (lỗi → rollback toàn bộ)
        kết quả { created, assignmentsCreated } ─► UI summary
```

### Validation codes (i18n vi/en)
`IMPORT_FILE_TOO_LARGE`, `IMPORT_TOO_MANY_ROWS`, `IMPORT_MISSING_REQUIRED`,
`IMPORT_INVALID_ASSET_CODE`, `IMPORT_ASSET_CODE_DUPLICATE_IN_FILE`,
`IMPORT_ASSET_CODE_EXISTS`, `IMPORT_CATEGORY_NOT_FOUND`, `IMPORT_INVALID_DATE`,
`IMPORT_INVALID_ENUM`, `IMPORT_INVALID_COST`, `IMPORT_OWNER_NOT_FOUND`,
`IMPORT_OWNER_MISSING_ASSIGNED_DATE`.

---

## Code Style
- Tuân thủ toàn bộ rule trong `.claude/rules/` (error-handling, security, naming, api-conventions, database, testing).
- Chỉ dùng design token; Tailwind v4; dark mode qua `.dark`; i18n vi+en (không hardcode text).
- Tái sử dụng primitive: `assetService`, `<Can>`, `usePermission`, toast wrapper, query keys `assetKeys`.

---

## Testing Strategy
- **Unit:**
  - Row validator (mỗi error code), parse date/enum/cost, dedupe `assetCode` trong file
  - Resolve category theo code, resolve owner theo email/mã NV
- **Integration:**
  - `/validate` trả summary đúng + **không** ghi DB
  - `/import` happy path: N dòng → N asset, K assignment cho dòng có owner, asset.status=ASSIGNED đúng
  - **Atomic:** chèn 1 dòng có `assetCode` trùng DB (giả lập race sau validate) → 409, **0 asset** được tạo (assert count không đổi)
  - RBAC: 403 cho `EMPLOYEE`/`MANAGER`; tenant isolation (không import vào tenant khác)
- **E2E (Playwright):** tải template → upload file có lỗi cố ý → thấy bảng lỗi, nút Import disabled → sửa → upload lại → confirm → thấy summary "đã tạo N tài sản"; assert danh sách tài sản tăng đúng N.

---

## Boundaries

### Always Do
- Enforce `requirePermission('assets:import')` server-side; tenant-scope mọi query/write
- Validate đầy đủ trước khi ghi (dry-run); re-validate ngay trước commit
- Commit trong **một** transaction — không bao giờ ghi nửa chừng
- `assetCode` unique trong file và so với DB; chuẩn hóa UPPERCASE

### Ask First
- Thêm dependency parser mới (nếu reader employee chưa tách module dùng chung) — theo `tech-stack.md`
- Chốt cap cuối: max rows (2.000?), max file size, transaction timeout
- Có cần cho phép owner ở trạng thái khác `ACTIVE` (đã nghỉ việc) không
- Khi nào cần chuyển import sang queue bất đồng bộ (nếu nhu cầu vượt 2.000 dòng/lần)

### Never Do
- Không auto-create category trong v1 (báo lỗi để HR tạo trước)
- Không cho import khi còn dòng lỗi (vi phạm "tất cả hoặc không")
- Không bypass tenant scoping hay ghi chéo tenant
- Không log dữ liệu nhạy cảm

---

## Open Questions (cho /plan)
1. Reader xlsx/csv của employee import đã tách thành module dùng chung chưa, hay cần refactor ra `lib/spreadsheet`?
2. Cap max rows cuối cùng (2.000 đủ cho đợt triển khai lớn nhất dự kiến?) — nếu vượt, hướng dẫn chia file hay chuyển sang queue?
3. Owner đã nghỉ việc (status ≠ ACTIVE) có được phép gán không?
4. Có cần cột `status` trong template (cho phép set sẵn `UNDER_MAINTENANCE`/`RETIRED`) hay luôn mặc định `AVAILABLE`/`ASSIGNED`?

---

## Next Step
Sau khi duyệt, chạy `/plan` để decompose thành vertical slices
(RBAC permission → validator+parser → service transaction → API routes →
frontend wizard → i18n → tests).
