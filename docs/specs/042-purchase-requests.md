# SPEC-042: Purchase Request (Phiếu đề xuất mua hàng)

**Status:** Approved (discovery resolved 2026-06-24)
**Created:** 2026-06-24
**Author:** Claude + Hạnh
**Depends on:** SPEC-003 (Authorization/RBAC), SPEC-005 (Leave Approval Flow — routing engine), SPEC-023 (OT Approval Flow — pattern tái dùng engine), SPEC-039 (CV Storage/GCS — hạ tầng lưu file), SPEC-041 (Payment Request — module khuôn mẫu để mirror)

---

## Objective

Cho phép nhân viên (bộ phận sale, vận hành, mua hàng…) tạo **phiếu đề xuất mua hàng
(Purchase Requisition)** liệt kê **nhiều dòng hàng** (SKU, tên sản phẩm, ĐVT, số lượng,
đơn giá, VAT) gửi tới một **nhà cung cấp**, kèm chứng từ (báo giá/hợp đồng). Phiếu đi qua
**chuỗi duyệt cố định Nhân viên → Quản lý trực tiếp → Founder**; mỗi cấp có thể **duyệt**,
**trả về để sửa** hoặc **từ chối**; sau khi duyệt xong, người có quyền **đánh dấu "Đã đặt
hàng"** (đã phát hành PO cho NCC). Tái dùng tối đa **routing engine
`ApprovalFlow`/`ApprovalStep`**, **hạ tầng lưu file** và **toàn bộ khuôn mẫu module
Payment Request (SPEC-041)**.

## Vấn đề cần giải

- Hiện việc đề xuất mua hàng đi qua file PDF/Excel rời rạc (xem file mẫu
  `PR-20260623-001.pdf`): không có dấu vết duyệt, không tổng hợp được chi phí mua sắm đang
  chờ, Founder không thấy bức tranh tổng thể.
- Cần một luồng minh bạch: ai đề xuất, mua gì (chi tiết từng dòng), của nhà cung cấp nào,
  ai duyệt cấp nào, đã đặt hàng chưa, chứng từ đính kèm ở đâu, tổng tiền (gồm VAT) bao nhiêu.

## Quyết định discovery (đã chốt 2026-06-24)

1. **Mirror nguyên kiến trúc Payment Request (SPEC-041)** — cùng routing engine, cùng mô
   hình approval theo vòng (round), scope `mine/review/all`, attachments, stats, export.
   Khác biệt cốt lõi: **nhiều dòng hàng** thay cho 1 số tiền duy nhất; **không có "loại đơn"**.
2. **Luồng duyệt cố định 2 cấp** — `Nhân viên → Quản lý trực tiếp → Founder`. **Không** theo
   ngưỡng số tiền, **không** xây UI cấu hình luồng. Seed sẵn **1 flow `PURCHASE` mặc định**:
   `Bước 1 = MANAGER` (Employee.managerId), `Bước 2 = ROLE = super_admin` (Founder).
3. **"Founder" = `SUPER_ADMIN`** — bước cuối trỏ `ROLE=super_admin`; `SUPER_ADMIN` match mọi
   bước nên Founder thấy + duyệt được mọi phiếu. Founder tự nộp phiếu → mọi bước auto-skip →
   phiếu **tự `APPROVED`**.
4. **Dòng hàng (line items) 1..N** — mỗi dòng: `sku` (tuỳ chọn), `productName` (bắt buộc),
   `unit` (ĐVT, vd "cái"), `quantity` > 0, `unitPrice` ≥ 0, `taxRate` (% VAT của **dòng**,
   default 8). Phiếu phải có **≥ 1 dòng**.
5. **VAT theo từng dòng hàng** — mỗi dòng có `taxRate` riêng. Tổng tính ở server (không tin
   client): `lineSubtotal = quantity × unitPrice`; `lineTax = round(lineSubtotal × taxRate/100)`;
   `lineTotal = lineSubtotal + lineTax`. Phiếu: `subtotal = Σ lineSubtotal`,
   `taxAmount = Σ lineTax`, `totalAmount = subtotal + taxAmount`. Lưu cả 3 tổng (denormalized,
   tính lại mỗi lần create/update để export & stats nhanh, không JOIN).
6. **Nhà cung cấp** — `vendorName` (bắt buộc, free-text; không xây master data NCC iteration
   này). `expectedDeliveryDate` (ngày giao dự kiến, tuỳ chọn).
7. **Đặt hàng thủ công** — duyệt xong → `APPROVED`; người có `purchase_request:mark_ordered`
   bấm "Đã đặt hàng" → `ORDERED` (ghi `orderedAt`, `orderedBy`, `orderNote`: số PO/ghi chú).
   **Không** sinh PO PDF trong iteration này.
8. **Hai hành động phản hồi** — `Từ chối` (`REJECTED`, terminal, bắt buộc lý do) và `Trả về`
   (`RETURNED`, NV sửa & gửi lại vòng mới). Tái dùng nguyên từ Payment Request.
9. **Đính kèm nhiều file** — JPG/PNG/WEBP/PDF, ≤ 10MB/file, ≤ 10 file/phiếu (báo giá, hợp
   đồng, hình mẫu). Tái dùng storage driver; prefix `/uploads/purchase`.
10. **Sidebar nhóm "Tài chính"** (`groups.finance`, đã có từ SPEC-041) thêm menu "Đề xuất mua hàng".
11. **Thống kê theo cả phòng ban và nhà cung cấp** — ngoài KPI tổng + 12 tháng + breakdown
    theo trạng thái, thêm breakdown **theo phòng ban** (top) và **theo nhà cung cấp** (top).
12. **Export Excel = 1 dòng / phiếu** (tóm tắt): mã, ngày, người YC, phòng ban, NCC, ngày giao
    DK, số dòng hàng, subtotal, VAT, tổng, trạng thái, người duyệt cuối, ngày đặt hàng.
13. **`mark_ordered`** cấp cho **cả `HR_MANAGER` và Founder (`SUPER_ADMIN`)**.
14. **Export PDF phiếu PO** — sinh PDF **đúng layout file mẫu `PR-20260623-001.pdf`** để in/gửi
    NCC (A4, header công ty + bảng dòng hàng + tổng + ô ký). Dùng **pdfkit + font Be Vietnam
    Pro** (mirror `payslip.pdf.ts`/`handover.pdf.ts`). Header công ty lấy từ
    `Tenant.settings.company` (`name`, `address`, `taxCode`, `phone` — SPEC-036). Gate
    `purchase_request:view` (+scope); tải được ở **mọi trạng thái** (phiếu đề xuất là chứng từ).

## Target Users

| User | Actions |
|------|---------|
| **Employee / Sale / Vận hành / Mua hàng** | Tạo phiếu + dòng hàng + đính kèm; xem phiếu của mình; sửa & gửi lại khi bị trả về; huỷ phiếu chưa duyệt |
| **Manager / Trưởng phòng** | Duyệt / trả về / từ chối phiếu của **nhân viên cấp dưới** ở bước của mình; xem phiếu cấp dưới |
| **Founder (SUPER_ADMIN)** | Thấy **tất cả** phiếu; duyệt bước cuối; trả về / từ chối; **đánh dấu đã đặt hàng** |
| **HR Manager** | Xem tất cả, export, `mark_ordered`; (đóng vai mua hàng/kế toán) |

---

## Core Features

### 1. Tạo phiếu đề xuất mua hàng
**Acceptance Criteria:**
- [ ] Field chung: `title` (bắt buộc, vd "Mua gỗ teak lô tháng 7"), `vendorName` (bắt buộc),
      `expectedDeliveryDate` (tuỳ chọn), `description`/`notes` (tuỳ chọn), `currency` (default `VND`).
- [ ] **Dòng hàng ≥ 1**: mỗi dòng `sku?`, `productName` (bắt buộc), `unit?`, `quantity` > 0,
      `unitPrice` ≥ 0, `taxRate` (default 8, 0–100). Thêm/xoá dòng động.
- [ ] **Tổng tính real-time ở client để hiển thị**, nhưng **server tính lại & lưu** subtotal/taxAmount/total.
- [ ] **Đính kèm 0..N file** (JPG/PNG/WEBP/PDF, ≤ 10MB/file, ≤ 10 file).
- [ ] Khi gửi: resolve flow `PURCHASE` → snapshot các bước → `currentStep = 1`, `PENDING`.
- [ ] Default thông minh: `currency=VND`, `taxRate=8`, 1 dòng hàng trống sẵn.

### 2. Định tuyến khi gửi phiếu
**Acceptance Criteria:**
- [ ] Resolve flow `PURCHASE` theo `employee.departmentId` → flow mặc định tenant → seed đảm bảo luôn có flow 2 bước.
- [ ] **Snapshot** bước vào `PurchaseRequestApproval` (bất biến khi đổi flow sau).
- [ ] **Auto-skip** bước MANAGER khi NV chưa có manager / trùng người nộp (ghi note). `ROLE` không auto-skip.
- [ ] Mọi bước bị skip (Founder tự nộp) → phiếu **tự `APPROVED`**.

### 3. Duyệt theo cấp
**Acceptance Criteria:**
- [ ] `approve` chỉ tác động **bước hiện tại**; người gọi phải **đúng người duyệt mong đợi** **và** có `purchase_request:approve` (SUPER_ADMIN implicit-all).
- [ ] Duyệt bước k < N → `currentStep++`, vẫn `PENDING`. Duyệt bước cuối → `APPROVED`, `reviewedAt=now`.
- [ ] Không hành động trên phiếu không ở `PENDING`.

### 4. Trả về (sửa) & Từ chối (terminal)
**Acceptance Criteria:**
- [ ] `Trả về` → `RETURNED` + **note bắt buộc**; chủ phiếu sửa & gửi lại → vòng mới (`round + 1`, giữ lịch sử).
- [ ] `Từ chối` → `REJECTED` **terminal** + **note bắt buộc**; không gửi lại được.
- [ ] Re-validate khi gửi lại (≥ 1 dòng, quantity > 0, unitPrice ≥ 0, vendorName).
- [ ] Chủ phiếu **huỷ** phiếu `PENDING`/`RETURNED` → `CANCELLED`.

### 5. Đánh dấu đã đặt hàng
**Acceptance Criteria:**
- [ ] Chỉ phiếu `APPROVED` mới `mark_ordered` được; gate `purchase_request:mark_ordered`.
- [ ] Bấm "Đã đặt hàng" → `ORDERED`, lưu `orderedAt`, `orderedById`, `orderNote` (tuỳ chọn: số PO).
- [ ] `ORDERED` là terminal.

### 6. Danh sách theo phạm vi (scope) + bộ lọc
**Acceptance Criteria:**
- [ ] `scope=mine` (mặc định) / `scope=review` (chờ chính mình duyệt) / `scope=all` (cần `purchase_request:approve`, role khác → 403).
- [ ] Lọc theo `status`, `vendorName` (search), khoảng `totalAmount`, khoảng ngày; sort; phân trang server-side.
- [ ] Hiển thị tổng tiền (totalAmount) theo bộ lọc hiện tại.

### 7. Thống kê
**Acceptance Criteria:**
- [ ] KPI: tổng chi phí mua hàng năm, tổng đã đặt (ORDERED), tổng đang chờ (PENDING), số phiếu.
- [ ] Biểu đồ 12 tháng (theo `createdAt`, dùng `totalAmount`).
- [ ] Breakdown theo **trạng thái**, theo **phòng ban** (top), theo **nhà cung cấp** (top).

### 8. Export Excel
**Acceptance Criteria:**
- [ ] 1 dòng / phiếu; cột: Mã (code), Ngày tạo, Tiêu đề, Người YC, Mã NV, Phòng ban, Nhà cung
      cấp, Ngày giao DK, Số dòng hàng, Subtotal, VAT, Tổng, Trạng thái, Người duyệt cuối, Ngày đặt hàng, Ghi chú đặt hàng.
- [ ] Cột số: `#,##0`, canh phải; dòng TỔNG cuối cộng subtotal/VAT/tổng. Sheet "Đề xuất mua hàng".

### 9. Export PDF phiếu PO (in gửi nhà cung cấp)
**Acceptance Criteria:**
- [ ] `GET /:id/pdf` trả `application/pdf`, A4, layout **bám file mẫu `PR-20260623-001.pdf`**:
  - **Header công ty**: tên (lớn, đậm) + dòng `địa chỉ · 📞 phone · MST: taxCode` (từ `Tenant.settings.company`; field trống → ẩn).
  - **Tiêu đề**: `PHIẾU ĐỀ XUẤT MUA HÀNG` + dòng phụ `(PURCHASE REQUISITION)`.
  - **Lưới thông tin**: Mã PR (`code`) · Ngày lập (`createdAt`) · Người YC (`employee.fullName`) · Bộ phận (`departmentName`) · Kính gửi (`vendorName`) · Ngày giao DK (`expectedDeliveryDate`) · Ghi chú (`description`).
  - **Bảng dòng hàng**: cột STT · Mã SKU · Tên Sản Phẩm · ĐVT · Số Lượng · Đơn Giá (₫) · Thành Tiền (₫) (= `lineSubtotal`, trước thuế — khớp mẫu). Tự xuống trang khi nhiều dòng (lặp header bảng).
  - **Tổng**: `TỔNG CỘNG` (subtotal) · `Thuế VAT` (taxAmount) · `TỔNG THANH TOÁN` (totalAmount), canh phải, `tabular`.
  - **Ô ký**: "Người lập phiếu" (tên người tạo) · "Quản lý phê duyệt" (tên `reviewedBy` nếu đã duyệt, ngược lại để trống).
- [ ] Tên file tải về: `<code>.pdf` (vd `PR-20260623-001.pdf`).
- [ ] Tiền render `vi-VN` + ` ₫`; ngày `dd/MM/yyyy`.

### 10. UI
**Acceptance Criteria:**
- [ ] Menu "Đề xuất mua hàng" (`/purchase-requests`, icon `ShoppingCart`, permission `purchase_request:view`) trong nhóm "Tài chính".
- [ ] Tabs: `Phiếu của tôi` / `Chờ tôi duyệt` / `Tất cả` / `Thống kê`.
- [ ] **Form tạo/sửa = Sheet** rộng (line items cần chỗ): bảng dòng hàng nhập liệu (thêm/xoá
      dòng), cột Thành tiền tự tính, dòng tổng (subtotal/VAT/total) cập nhật real-time; uploader nhiều file.
- [ ] **Chi tiết phiếu = Sheet**: header + **bảng dòng hàng** (read-only) + tổng + chứng từ + **timeline duyệt**.
- [ ] Nút hành động theo trạng thái + quyền: Duyệt / Trả về / Từ chối / Đã đặt hàng / Huỷ / Sửa & gửi lại.
- [ ] Nút **"Xuất PDF"** (icon `Printer`/`FileDown`) trong Sheet chi tiết & menu hành động của mỗi dòng — mở/tải `GET /:id/pdf`.
- [ ] Số: `tabular-nums`, `formatCurrency`. Skeleton/empty/error; status badge màu + chữ; dark mode; i18n vi+en; design token (no hex); WCAG AA.

---

## Data Model (bổ sung)

```prisma
enum PurchaseRequestStatus { PENDING APPROVED REJECTED RETURNED CANCELLED ORDERED }

model PurchaseRequest {
  id            String   @id @default(cuid())
  tenantId      String   @map("tenant_id")
  employeeId    String   @map("employee_id")            // người tạo phiếu
  code          String   @map("code")                   // PR-YYYYMMDD-NNN (tự sinh, unique theo tenant)
  title         String
  description   String?
  vendorName    String   @map("vendor_name")            // nhà cung cấp (kính gửi)
  expectedDeliveryDate DateTime? @map("expected_delivery_date")
  currency      String   @default("VND")
  status        PurchaseRequestStatus @default(PENDING)

  // tổng tiền (denormalized, server tính lại mỗi create/update)
  subtotal      Decimal  @db.Decimal(14, 2) @default(0)
  taxAmount     Decimal  @db.Decimal(14, 2) @default(0) @map("tax_amount")
  totalAmount   Decimal  @db.Decimal(14, 2) @default(0) @map("total_amount")

  // routing (tái dùng ApprovalFlow)
  flowId        String?  @map("flow_id")
  flow          ApprovalFlow? @relation(fields: [flowId], references: [id])
  currentStep   Int      @default(0) @map("current_step")
  reviewedById  String?  @map("reviewed_by_id")
  reviewedAt    DateTime? @map("reviewed_at")
  reviewNote    String?  @map("review_note")

  // đặt hàng
  orderedById   String?  @map("ordered_by_id")
  orderedAt     DateTime? @map("ordered_at")
  orderNote     String?  @map("order_note")

  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee    Employee @relation("EmployeePurchaseRequests", fields: [employeeId], references: [id], onDelete: Cascade)
  reviewedBy  Employee? @relation("PurchaseRequestReviewer", fields: [reviewedById], references: [id])
  orderedBy   Employee? @relation("PurchaseRequestOrderer", fields: [orderedById], references: [id])
  items       PurchaseRequestItem[]
  approvals   PurchaseRequestApproval[]
  attachments PurchaseRequestAttachment[]

  @@unique([tenantId, code])
  @@index([tenantId, status])
  @@index([employeeId])
  @@index([flowId])
  @@map("purchase_requests")
}

model PurchaseRequestItem {
  id          String   @id @default(cuid())
  requestId   String   @map("request_id")
  lineNo      Int      @map("line_no")                  // 1-based, thứ tự hiển thị
  sku         String?                                   // mã SKU (tuỳ chọn)
  productName String   @map("product_name")
  unit        String?                                   // ĐVT: cái, bộ, kg...
  quantity    Decimal  @db.Decimal(14, 3)               // hỗ trợ số lẻ (kg, m3...)
  unitPrice   Decimal  @db.Decimal(14, 2) @map("unit_price")
  taxRate     Decimal  @db.Decimal(5, 2) @default(8) @map("tax_rate")  // % VAT của dòng
  lineSubtotal Decimal @db.Decimal(14, 2) @map("line_subtotal")        // quantity × unitPrice
  lineTax     Decimal  @db.Decimal(14, 2) @map("line_tax")             // lineSubtotal × taxRate/100
  lineTotal   Decimal  @db.Decimal(14, 2) @map("line_total")           // lineSubtotal + lineTax

  request PurchaseRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  @@index([requestId])
  @@map("purchase_request_items")
}

model PurchaseRequestApproval {        // audit trail theo bước/vòng (song song PaymentRequestApproval)
  id           String   @id @default(cuid())
  tenantId     String   @map("tenant_id")
  requestId    String   @map("request_id")
  round        Int      @default(1)
  stepOrder    Int      @map("step_order")
  approverType ApproverType @map("approver_type")
  roleKey      String?  @map("role_key")
  approverId   String?  @map("approver_id")
  decision     ApprovalDecision?                 // null = đang chờ
  decidedById  String?  @map("decided_by_id")
  decidedAt    DateTime? @map("decided_at")
  note         String?
  createdAt    DateTime @default(now()) @map("created_at")
  tenant    Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  request   PurchaseRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  decidedBy Employee? @relation("PurchaseApprovalDecider", fields: [decidedById], references: [id])
  @@unique([requestId, round, stepOrder])
  @@index([requestId])
  @@index([tenantId])
  @@map("purchase_request_approvals")
}

model PurchaseRequestAttachment {
  id        String   @id @default(cuid())
  requestId String   @map("request_id")
  fileUrl   String   @map("file_url")               // /uploads/purchase/<uuid>.<ext>
  fileName  String   @map("file_name")
  mimeType  String   @map("mime_type")
  size      Int                                      // bytes
  createdAt DateTime @default(now()) @map("created_at")
  request PurchaseRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  @@index([requestId])
  @@map("purchase_request_attachments")
}

// Sửa enum/relation hiện có:
// enum ApprovalFlowType { LEAVE OVERTIME PAYMENT PURCHASE }   // + PURCHASE
// model ApprovalFlow { purchaseRequests PurchaseRequest[] }   // back-relation
// model Employee {
//   purchaseRequests        PurchaseRequest[] @relation("EmployeePurchaseRequests")
//   purchaseReviewed        PurchaseRequest[] @relation("PurchaseRequestReviewer")
//   purchaseOrdered         PurchaseRequest[] @relation("PurchaseRequestOrderer")
//   purchaseApprovalDecided PurchaseRequestApproval[] @relation("PurchaseApprovalDecider")
// }
// model Tenant { purchaseRequests PurchaseRequest[] ; purchaseRequestApprovals PurchaseRequestApproval[] }
```

## API (dưới `/api/v1/purchase-requests`)

| Method | Path | Permission | Notes |
|--------|------|-----------|-------|
| GET | `/` | `purchase_request:view` | list theo `scope=mine\|review\|all` + filter; kèm tổng tiền |
| GET | `/stats` | `purchase_request:view` | thống kê năm (tháng/trạng thái/phòng ban/NCC) |
| GET | `/export` | `purchase_request:export` | xuất Excel theo bộ lọc (1 dòng/phiếu) |
| GET | `/:id` | `purchase_request:view` | chi tiết + `items` + `approvals` + `attachments`; owner luôn xem được, người khác cần review-capability |
| GET | `/:id/pdf` | `purchase_request:view` (+scope) | sinh PDF phiếu PO (A4, layout file mẫu); `Content-Type: application/pdf`, filename `<code>.pdf` |
| POST | `/` | `purchase_request:create` | tạo phiếu + items (chưa có file) → trả `id` (sinh `code`) |
| PATCH | `/:id` | (ownership) | sửa phiếu + items khi `PENDING`/`RETURNED` (replace toàn bộ items) |
| POST | `/:id/attachments` | `purchase_request:create` (+ownership) | upload 1 file (multipart `file`) |
| DELETE | `/:id/attachments/:attId` | (ownership) | xoá file khi `PENDING`/`RETURNED` |
| GET | `/:id/attachments/:attId/download` | `purchase_request:view` (+scope) | stream file (RBAC) |
| POST | `/:id/approve` | `purchase_request:approve` | tác động bước hiện tại |
| POST | `/:id/reject` | `purchase_request:reject` | body `{ mode: 'return'\|'reject', note }` |
| POST | `/:id/resubmit` | (ownership) | sửa & gửi lại phiếu `RETURNED` (vòng mới) |
| POST | `/:id/cancel` | (ownership) | huỷ phiếu `PENDING`/`RETURNED` → `CANCELLED` |
| POST | `/:id/mark-ordered` | `purchase_request:mark_ordered` | phiếu `APPROVED` → `ORDERED` + `orderNote` |

## Logic định tuyến (tái dùng `approval-routing.helper.ts` — generic, 0 thay đổi)

```
resolveFlow(employee, flowType=PURCHASE):
  flow = activeFlow(tenant, employee.departmentId, PURCHASE)
       ?? defaultFlow(tenant, PURCHASE)        // seed đảm bảo luôn tồn tại (2 bước cố định)
buildApprovalSnapshot(): auto-skip NO_APPROVER / SELF_APPROVAL / DUPLICATE_APPROVER (ROLE không skip)
advance(): hết step → APPROVED ; return → RETURNED ; reject → REJECTED (terminal)
```

## Logic tính tổng (server, trong transaction create/update/resubmit)

```
cho mỗi item:
  lineSubtotal = round2(quantity × unitPrice)
  lineTax      = round2(lineSubtotal × taxRate / 100)
  lineTotal    = lineSubtotal + lineTax
phiếu:
  subtotal    = Σ lineSubtotal
  taxAmount   = Σ lineTax
  totalAmount = subtotal + taxAmount
```

## Mã phiếu (code) — `PR-YYYYMMDD-NNN`

- Sinh ở server khi create: `PR-<ngày tạo yyyyMMdd>-<seq 3 chữ số/ngày/tenant>`.
- Tính `seq` = (số phiếu của tenant trong ngày) + 1, trong transaction, kiểm `@@unique([tenantId, code])`; retry nếu đụng.

## Tái sử dụng hạ tầng

| Thành phần | Chiến lược |
|-----------|-----------|
| `approval-routing.helper.ts`, `approval-flow.service.ts` | **Dùng nguyên**, lọc `flowType=PURCHASE` |
| Decision engine approve/return/reject/resubmit | Tái dùng helper chung của Payment (đã có nhánh REJECTED) |
| Storage driver + upload middleware | **Nhân bản** từ payment (MIME ảnh+pdf, ≤10MB), prefix `/uploads/purchase` |
| `payslip.pdf.ts` / `handover.pdf.ts` (pdfkit + Be Vietnam Pro) | **Khuôn mẫu** cho `po.pdf.ts`; lấy `companyName/address/taxCode/phone` từ `settings.service` (`Tenant.settings.company`) |
| `payment-request.*` (controller/service/validator/routes) | **Nhân bản → purchase-request.*** rồi thêm items + totals + code |
| Frontend `features/payment-request/*` | **Nhân bản → features/purchase-request/*** + bảng line items trong Form/Detail |
| `PaymentTimeline`, `PaymentStatsPanel`, `PaymentStatusBadge`, uploader | **Nhân bản** sang purchase |
| RBAC middleware/hook, Sidebar filter, nhóm `groups.finance` | **Dùng nguyên** |

## Permissions (thêm mới)

Thêm vào `PERMISSION_CATALOG` (`packages/shared/src/types/rbac.ts`):
```
purchase_request: ['view', 'create', 'update', 'approve', 'reject', 'mark_ordered', 'export']
```
Gán trong `apps/api/src/domain/rbac/catalog.ts` (chạy lại seed RBAC):

| Role | Quyền purchase_request |
|------|----------------------|
| `SUPER_ADMIN` (Founder) | `*` (implicit-all) |
| `HR_MANAGER` | view, create, approve, reject, mark_ordered, export |
| `MANAGER` | view, create, approve, reject |
| `EMPLOYEE` | view, create |

> `approve`/`reject` ở MANAGER **cộng** kiểm tra "đúng người duyệt bước hiện tại" ở service.

## i18n

- Namespace mới `purchase.json` (vi + en) cho toàn bộ chuỗi của feature.
- Bổ sung key vào `nav.json`: `items.purchaseRequests`, `titles.purchaseRequests` (nhóm `groups.finance` đã có).

## Out of scope (iteration sau)

- Master data nhà cung cấp (vendor) + danh mục sản phẩm/SKU; hiện free-text.
- Theo dõi nhận hàng (goods receipt) / đối chiếu hoá đơn sau khi đặt hàng.
- Cấu hình luồng duyệt trong UI; duyệt theo **ngưỡng số tiền** / rẽ nhánh.
- Liên kết Purchase → Payment Request (thanh toán cho NCC sau khi đặt hàng).
- Đa tiền tệ + tỷ giá (giữ `currency`, mặc định VND).
- Thông báo email/in-app; OCR báo giá.

## Non-functional

- **Tenant-scoped tuyệt đối**; RBAC **server-side**; mọi đổi trạng thái + ghi items trong **transaction**.
- TDD cho tính tổng (per-line VAT + rounding), routing/advance/return/reject, sinh `code`.
- Integration test RBAC theo cấp + scope.
- E2E critical-path: tạo phiếu (3 dòng hàng, VAT khác nhau) → manager duyệt → founder duyệt →
  mark ordered; và nhánh manager **trả về** → NV sửa & gửi lại; assert **business outcome**
  (status + tổng tiền tính đúng + ai duyệt).
- File: validate MIME + size **ở server**; tải qua API + RBAC.
- WCAG AA, dark mode, i18n vi+en, design token (no hex), số `tabular-nums`.

## Boundaries

### Always Do
- **Server tính lại tổng** từ items (không tin số client gửi lên).
- Enforce "đúng người duyệt bước hiện tại" ở **server**.
- Snapshot bước duyệt vào `PurchaseRequestApproval`.
- Validate loại/dung lượng file + quét quyền trước khi cho tải.
- Note **bắt buộc** khi `Trả về` / `Từ chối`. Phiếu phải có **≥ 1 dòng hàng**.
- Auto-skip bước MANAGER khi NV chưa có manager.

### Ask First
- Đổi terminal state (vd thêm "Đã nhận hàng") hoặc liên kết sang Payment/Payroll.
- Thêm master data NCC/SKU.

### Never Do
- Không cho tự duyệt phiếu của mình ở bước MANAGER/ROLE thường (trừ Founder qua auto-skip).
- Không sửa/huỷ phiếu đã `APPROVED`/`ORDERED`/`REJECTED`/`CANCELLED`.
- Không lưu file ra public bucket; không trả file thiếu kiểm tra quyền + tenant.
- Không hardcode "Founder" bằng email — dùng `ROLE=super_admin` qua engine.
```
