# Feature: Import line items vào form New Purchase Request (SPEC-047)

## Objective
Cho phép người tạo phiếu mua hàng nhập nhanh danh sách dòng hàng (`items[]`) từ file
Excel/CSV vào form **New Purchase Request** thay vì gõ tay từng dòng, giữ nguyên luồng
tạo phiếu (submit / approval / PDF) hiện có.

## Target Users
Bất kỳ người dùng có quyền `purchase_request:create` (SUPER_ADMIN, HR_MANAGER, MANAGER,
EMPLOYEE) khi lập phiếu có nhiều mặt hàng.

## Core Features
1. **Tải template** — Nút tải file `.xlsx` mẫu (6 cột item + sheet hướng dẫn, 2 dòng ví
   dụ, localized vi/en). AC: tải được từ bước Upload; header khớp cột parse chấp nhận.
2. **Parse + validate (server-side, stateless)** — `POST /purchase-requests/import/parse`
   nhận file, trả `{ totalRows, validCount, errorCount, rows[], errors[] }`. Validate
   thuần dữ liệu, **không** query DB, **không** staging/job. AC: file thiếu cột bắt buộc →
   lỗi cấp file; dòng `quantity<=0`, `unitPrice<0`, `taxRate` ngoài 0–100, số không hợp lệ,
   thiếu `productName/quantity/unitPrice` → lỗi cấp dòng; dòng hợp lệ vẫn trả về.
3. **Wizard 2 bước (Upload → Review)** — `Sheet` từ phải. Review hiện stat cards
   (tổng/hợp lệ/lỗi) + bảng lỗi (row·column·message). AC: chỉ 2 bước, không có
   Importing/Done (vì không ghi DB).
4. **Merge vào form** — Xác nhận append dòng hợp lệ vào `useFieldArray`; nếu form chỉ có 1
   dòng rỗng mặc định thì `replace` bằng dữ liệu import. AC: đúng số dòng hợp lệ được thêm;
   totals (subtotal/VAT/total) và validate Zod chạy lại tự động; dòng lỗi bị bỏ.

## Out of Scope
- Import hàng loạt nhiều phiếu PR cùng lúc (đó là feature trang danh sách, không phải màn New PR).
- Ghi thẳng item vào DB / staging / background job.
- Resolve DB (SKU catalog, vendor) — chỉ nhận text như user gõ tay.
- Sửa dòng lỗi ngay trong wizard (user tự sửa file & tải lại, hoặc nhập tay sau).

## Technical Approach
### Shared types — `packages/shared/src/types/purchase-request-import.ts` (mới)
Bám chuẩn `asset-import.ts`:
- `PR_ITEM_IMPORT_COLUMNS = ['sku','productName','unit','quantity','unitPrice','taxRate']`
- `REQUIRED_PR_ITEM_IMPORT_COLUMNS = ['productName','quantity','unitPrice']`
- `PR_ITEM_IMPORT_ERROR_CODES` (FILE_TOO_LARGE, TOO_MANY_ROWS, EMPTY_FILE, UNREADABLE_FILE,
  MISSING_COLUMNS, MISSING_REQUIRED, INVALID_NUMBER, QUANTITY_NOT_POSITIVE,
  UNIT_PRICE_NEGATIVE, TAX_RATE_RANGE)
- `ParsedPRItemRow`, `ValidatedPRItemRow` (= `PurchaseRequestItemInput`),
  `PRItemImportRowError`, `PRItemImportParseResult`

### Backend — `apps/api/src/domain/purchase-request-import/`
- `.parser.ts` — tái dùng ExcelJS + header-mapping (canonical EN + alias vi) từ `asset-import.parser.ts`.
- `.template.ts` — sinh `.xlsx`/`.csv` localized.
- `.parse.service.ts` — validate thuần (giới hạn ~200 dòng khớp `items.max(200)` của validator hiện có; default `taxRate=8`).
- `purchase-request-import.controller.ts` — `template`, `parse`.
- Routes thêm vào `purchase-request.routes.ts`, cả hai gate `requirePermission('purchase_request:create')`:
  - `GET  /purchase-requests/import/template`
  - `POST /purchase-requests/import/parse` (multer `file`, max ~2MB)

### Frontend — `apps/web/src/features/purchase-request/`
- `hooks/usePurchaseRequestImport.ts` — `useDownloadPRItemTemplate`, `useParsePRItems`.
- `components/PurchaseItemImportSheet.tsx` — Sheet 2 bước (khung UI copy từ `AssetImportWizard`, bỏ Importing/Done).
- Tích hợp: nút "Nhập từ Excel" cạnh nút "Thêm dòng" ở Section 2 của `CreatePurchaseRequestPage`, bọc `<Can permission="purchase_request:create">`.
- i18n `locales/{vi,en}/purchaseImport.json`.

### Không thay đổi
`POST /purchase-requests` (create), validator, approval flow, sinh code `PR-...`, PDF — giữ nguyên.

## Code Style
- Follow `.claude/rules/` (code-style, clean-code, api-conventions, security, ui-modern).
- ExcelJS ở backend (không thêm parser frontend). i18n bắt buộc đủ vi + en.

## Testing Strategy
- **Unit (Vitest, api)**: `parse.service` — thiếu cột; `quantity=0`; `taxRate=150`; số sai;
  dòng lỗi bị loại nhưng dòng hợp lệ vẫn trả; default taxRate=8.
- **E2E (web)**: upload file mẫu ở màn New PR → đúng số dòng append vào field array →
  submit tạo PR có đúng items + totals (assert kết quả nghiệp vụ, không chỉ coverage).

## Boundaries
### Always Do
- Gate cả 2 route bằng `requirePermission('purchase_request:create')`.
- Trả về dữ liệu để đổ vào form; việc persist vẫn qua `POST /purchase-requests`.
- i18n đủ 2 ngôn ngữ; error-code ổn định để map message.

### Ask First
- Đổi giới hạn số dòng (200) hoặc dung lượng file.
- Thêm resolve DB (SKU/vendor) — hiện out of scope.

### Never Do
- Không staging/job/ghi DB cho luồng import này.
- Không thêm dependency parser Excel ở frontend.
- Không đổi hợp đồng `POST /purchase-requests`.
