# SPEC-041: Payment Request (Yêu cầu thanh toán / Hoàn ứng)

**Status:** Approved (discovery resolved 2026-06-23)
**Created:** 2026-06-23
**Author:** Claude + Hạnh
**Depends on:** SPEC-003 (Authorization/RBAC), SPEC-005 (Leave Approval Flow — routing engine), SPEC-023 (OT Approval Flow — pattern tái dùng engine), SPEC-039 (CV Storage/GCS — hạ tầng lưu file)

---

## Objective

Cho phép nhân viên (NV thường, kế toán, nhân sự…) tạo **đơn yêu cầu thanh toán** kèm
ảnh **hoá đơn đỏ (VAT)** hoặc **bill** (mua sắm, ăn uống, đi lại…) để đề nghị công ty
chi trả/hoàn tiền. Đơn đi qua **chuỗi duyệt cố định Nhân viên → Quản lý trực tiếp →
Founder**; mỗi cấp có thể **duyệt**, **trả về để sửa** hoặc **từ chối**; sau khi duyệt
xong, kế toán/Founder **đánh dấu đã thanh toán** thủ công. Tái dùng tối đa **routing
engine `ApprovalFlow`/`ApprovalStep`** và **hạ tầng lưu file GCS** đã có.

## Vấn đề cần giải

- Hiện chưa có kênh chính thức để NV xin hoàn tiền/thanh toán; mọi việc qua chat, email,
  Excel rời rạc → thất lạc hoá đơn, không có dấu vết duyệt, Founder không thấy bức tranh
  tổng thể các khoản chi đang chờ.
- Cần một luồng minh bạch: ai tạo, ai duyệt cấp nào, đã trả chưa, chứng từ đính kèm ở đâu.

## Quyết định discovery (đã chốt 2026-06-23)

1. **Luồng duyệt cố định 2 cấp** — `Nhân viên → Quản lý trực tiếp → Founder`. **Không**
   theo ngưỡng số tiền, **không** xây UI cấu hình luồng (khác Leave/OT). Vẫn **tái dùng
   engine** bằng cách seed sẵn **1 flow `PAYMENT` mặc định** với 2 bước cố định:
   `Bước 1 = MANAGER` (Employee.managerId), `Bước 2 = ROLE = super_admin` (Founder).
2. **"Founder" = `SUPER_ADMIN`** — hệ thống không có role Founder riêng; tài khoản Founder
   (`hanhdinh@codecrush.asia`) là `SUPER_ADMIN`. Bước cuối trỏ `ROLE=super_admin`;
   `SUPER_ADMIN` vốn match mọi bước nên Founder thấy + duyệt được mọi đơn.
   *(Nếu sau này muốn cấp duyệt cuối là role khác — vd "Giám đốc/PAYROLL_APPROVER" — chỉ
   cần đổi `roleKey` của step seed, không đụng code.)*
3. **Ba loại đơn** — `REIMBURSEMENT` (hoàn ứng, đã chi), `ADVANCE` (tạm ứng, xin trước),
   `VENDOR_PAYMENT` (thanh toán nhà cung cấp theo hoá đơn đỏ). Dùng **một model thống
   nhất** với field tuỳ-loại nullable.
4. **Chi trả thủ công** — duyệt xong → `APPROVED`; người có `payment_request:mark_paid`
   bấm "Đã thanh toán" → `PAID` (ghi `paidAt`, `paidBy`, `paymentNote`). **Không** đụng
   module Payroll trong iteration này.
5. **Hai hành động phản hồi** — `Từ chối` (`REJECTED`, **terminal**, bắt buộc lý do) và
   `Trả về` (`RETURNED`, NV **sửa & gửi lại** vòng mới). Mô hình RETURNED tái dùng nguyên
   từ Leave/OT; bổ sung `REJECTED` cho tình huống từ chối hẳn khoản chi.
6. **Đính kèm nhiều file** — JPG/PNG/WEBP/PDF, nhiều file/đơn. Tái dùng storage driver
   (local↔GCS qua `STORAGE_DRIVER`), **bỏ** phần parse-text của CV.
7. **Nhóm sidebar mới "Tài chính"** (`groups.finance`) chứa menu "Yêu cầu thanh toán".
8. **Founder tự nộp đơn của chính mình** → khi mọi bước duyệt bị auto-skip (không còn
   người duyệt hợp lệ khác), đơn **tự `APPROVED`**; Founder là cấp cao nhất, không cần ai duyệt.
9. **`mark_paid`** cấp cho **cả `HR_MANAGER` và Founder (`SUPER_ADMIN`)**.

## Target Users

| User | Actions |
|------|---------|
| **Employee / Kế toán / Nhân sự** | Tạo đơn + đính kèm hoá đơn/bill; xem đơn của mình; sửa & gửi lại khi bị trả về; huỷ đơn chưa duyệt |
| **Manager / Trưởng phòng** | Duyệt / trả về / từ chối đơn của **nhân viên cấp dưới** ở bước của mình; xem đơn cấp dưới |
| **Founder (SUPER_ADMIN)** | Thấy **tất cả** đơn; duyệt bước cuối; trả về / từ chối; **đánh dấu đã thanh toán** |
| **HR Manager** | Xem tất cả, export; (tuỳ chọn) được `mark_paid` nếu đóng vai kế toán |

---

## Core Features

### 1. Tạo đơn yêu cầu thanh toán
**Acceptance Criteria:**
- [ ] Chọn **loại đơn** (`REIMBURSEMENT` | `ADVANCE` | `VENDOR_PAYMENT`); form hiện field theo loại.
- [ ] Field chung: `title` (bắt buộc), `amount` > 0 (Decimal), `currency` (default `VND`), `description`.
- [ ] Field theo loại:
  - REIMBURSEMENT: `expenseDate` (ngày đã chi, bắt buộc), `category` (tuỳ chọn).
  - ADVANCE: `neededByDate` (cần trước ngày), `purpose` (mục đích).
  - VENDOR_PAYMENT: `vendorName` (bắt buộc), `invoiceNumber` (tuỳ chọn), `dueDate`.
- [ ] **Đính kèm 0..N file** (JPG/PNG/WEBP/PDF, ≤ 10MB/file, ≤ 10 file). REIMBURSEMENT &
      VENDOR_PAYMENT **cảnh báo (không chặn)** nếu chưa có chứng từ.
- [ ] Khi gửi: resolve flow `PAYMENT` → snapshot các bước → `currentStep = 1`, `PENDING`.
- [ ] Default thông minh: `currency=VND`, `expenseDate=hôm nay`, `type=REIMBURSEMENT`.

### 2. Định tuyến khi gửi đơn
**Acceptance Criteria:**
- [ ] Resolve flow `PAYMENT` theo `employee.departmentId` → flow mặc định tenant (departmentId null) → seed luôn đảm bảo có **flow mặc định 2 bước**.
- [ ] **Snapshot** bước vào `PaymentRequestApproval` (bất biến khi sau này đổi flow).
- [ ] **Auto-skip** bước không giải được người duyệt: NV chưa có manager (bước MANAGER) hoặc trùng chính người nộp → ghi note hệ thống "auto-skipped". `ROLE` (bước Founder) **không** auto-skip.
- [ ] Nếu **mọi bước bị skip** (vd Founder tự nộp đơn, không còn ai khác) → xử lý theo Boundary "tự duyệt" (xem dưới).

### 3. Duyệt theo cấp
**Acceptance Criteria:**
- [ ] `approve` chỉ tác động **bước hiện tại**; người gọi phải **đúng người duyệt mong đợi** **và** có `payment_request:approve` (SUPER_ADMIN implicit-all).
- [ ] Duyệt bước k < N → ghi approval, `currentStep++`, đơn vẫn `PENDING`.
- [ ] Duyệt **bước cuối** → `APPROVED`, `reviewedAt=now`.
- [ ] Không hành động trên đơn không ở `PENDING`.

### 4. Trả về (sửa) & Từ chối (terminal)
**Acceptance Criteria:**
- [ ] `Trả về` (`payment_request:reject`) → `RETURNED` + **note bắt buộc**; dừng luồng; chủ đơn sửa & gửi lại → vòng mới (`round + 1`, giữ lịch sử).
- [ ] `Từ chối` (`payment_request:reject`) → `REJECTED` **terminal** + **note bắt buộc**; không gửi lại được (phải tạo đơn mới).
- [ ] Re-validate khi gửi lại (amount > 0, field theo loại, đính kèm).
- [ ] Chủ đơn **huỷ** đơn ở trạng thái `PENDING` hoặc `RETURNED` (owner + non-terminal) → `CANCELLED`.

### 5. Đánh dấu đã thanh toán
**Acceptance Criteria:**
- [ ] Chỉ đơn `APPROVED` mới `mark_paid` được; gate `payment_request:mark_paid`.
- [ ] Bấm "Đã thanh toán" → `PAID`, lưu `paidAt`, `paidById`, `paymentNote` (tuỳ chọn: số tham chiếu/ngày chuyển khoản).
- [ ] `PAID` là terminal; không huỷ/sửa sau khi đã trả (chỉnh sai → ngoài phạm vi, xử lý thủ công).

### 6. Danh sách theo phạm vi (scope) + bộ lọc
**Acceptance Criteria:**
- [ ] `scope=mine`: đơn của chính NV (mặc định).
- [ ] `scope=review`: đơn đang chờ **chính người đăng nhập** duyệt ở bước hiện tại.
- [ ] `scope=all`: toàn tenant — chỉ ai có `payment_request:approve` (Founder/HR); role khác gọi → 403.
- [ ] Lọc theo `status`, `type`, khoảng `amount`, khoảng ngày; sort; phân trang server-side.
- [ ] Hiển thị tổng tiền theo bộ lọc hiện tại (cho Founder nắm tổng khoản đang chờ).

### 7. UI
**Acceptance Criteria:**
- [ ] Nhóm sidebar mới **"Tài chính"** (`groups.finance`) → item "Yêu cầu thanh toán" (`/payment-requests`, icon `Receipt`, permission `payment_request:view`).
- [ ] Trang có **tabs**: `Đơn của tôi` / `Chờ tôi duyệt` (nếu có quyền duyệt) / `Tất cả` (nếu có quyền all).
- [ ] **Form tạo/sửa = Sheet** (drawer phải) + **uploader nhiều ảnh** có preview thumbnail, xoá từng file.
- [ ] **Chi tiết đơn = Sheet**: thông tin + danh sách chứng từ (xem/tải) + **timeline duyệt** (✓ ai duyệt/lúc nào · ⏳ bước hiện tại · ↩ trả về · ✕ từ chối · ⤼ auto-skip) — tái dùng pattern `LeaveTimeline`.
- [ ] Nút hành động theo trạng thái + quyền: Duyệt / Trả về / Từ chối / Đã thanh toán / Huỷ / Sửa & gửi lại.
- [ ] Số tiền: `tabular-nums`, format `formatCurrency` theo `currency`.
- [ ] Skeleton/empty/error đầy đủ; status badge **màu + chữ**; dark mode; i18n vi+en; design token (no hex); WCAG AA.

---

## Data Model (bổ sung)

```prisma
enum PaymentRequestType { REIMBURSEMENT ADVANCE VENDOR_PAYMENT }

enum PaymentRequestStatus { PENDING APPROVED REJECTED RETURNED CANCELLED PAID }

model PaymentRequest {
  id            String   @id @default(cuid())
  tenantId      String   @map("tenant_id")
  employeeId    String   @map("employee_id")            // người tạo đơn
  type          PaymentRequestType
  title         String
  description   String?
  amount        Decimal  @db.Decimal(14, 2)
  currency      String   @default("VND")
  status        PaymentRequestStatus @default(PENDING)

  // field tuỳ-loại (nullable)
  expenseDate   DateTime? @map("expense_date")          // REIMBURSEMENT
  category      String?                                 // REIMBURSEMENT
  neededByDate  DateTime? @map("needed_by_date")        // ADVANCE
  vendorName    String?   @map("vendor_name")           // VENDOR_PAYMENT
  invoiceNumber String?   @map("invoice_number")        // VENDOR_PAYMENT
  dueDate       DateTime? @map("due_date")              // VENDOR_PAYMENT

  // routing (tái dùng ApprovalFlow)
  flowId        String?  @map("flow_id")
  flow          ApprovalFlow? @relation(fields: [flowId], references: [id])
  currentStep   Int      @default(0) @map("current_step")
  reviewedById  String?  @map("reviewed_by_id")
  reviewedAt    DateTime? @map("reviewed_at")
  reviewNote    String?  @map("review_note")

  // thanh toán
  paidById      String?  @map("paid_by_id")
  paidAt        DateTime? @map("paid_at")
  paymentNote   String?  @map("payment_note")

  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  employee    Employee @relation("EmployeePaymentRequests", fields: [employeeId], references: [id])
  approvals   PaymentRequestApproval[]
  attachments PaymentRequestAttachment[]

  @@index([tenantId, status])
  @@index([employeeId])
  @@map("payment_requests")
}

model PaymentRequestApproval {        // audit trail theo bước, theo vòng (song song LeaveApproval)
  id                 String   @id @default(cuid())
  tenantId           String   @map("tenant_id")
  requestId          String   @map("request_id")
  round              Int      @default(1)
  stepOrder          Int      @map("step_order")
  approverType       ApproverType
  roleKey            String?  @map("role_key")
  approverId         String?  @map("approver_id")     // người duyệt mong đợi (resolved)
  decision           ApprovalDecision?                 // null = đang chờ
  decidedById        String?  @map("decided_by_id")
  decidedAt          DateTime? @map("decided_at")
  note               String?
  request   PaymentRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  @@unique([requestId, round, stepOrder])
  @@map("payment_request_approvals")
}

model PaymentRequestAttachment {
  id          String   @id @default(cuid())
  requestId   String   @map("request_id")
  fileUrl     String   @map("file_url")               // /uploads/payment/<uuid>.<ext>
  fileName    String   @map("file_name")
  mimeType    String   @map("mime_type")
  size        Int                                      // bytes
  createdAt   DateTime @default(now()) @map("created_at")
  request PaymentRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  @@index([requestId])
  @@map("payment_request_attachments")
}

// Sửa:
// enum ApprovalFlowType { LEAVE OVERTIME PAYMENT }   // + PAYMENT
// enum ApprovalDecision { APPROVED RETURNED AUTO_SKIPPED REJECTED }  // + REJECTED (additive, không ảnh hưởng Leave/OT)
// model ApprovalFlow { paymentRequests PaymentRequest[]  // back-relation }
// model Employee { paymentRequests PaymentRequest[] @relation("EmployeePaymentRequests") }
```

## API (dưới `/api/v1/payment-requests`)

| Method | Path | Permission | Notes |
|--------|------|-----------|-------|
| GET | `/` | `payment_request:view` | list theo `scope=mine\|review\|all` + filter; kèm tổng tiền |
| GET | `/:id` | `payment_request:view` | chi tiết + `approvals` (timeline) + `attachments`; owner luôn xem được, người khác cần review-capability |
| POST | `/` | `payment_request:create` | tạo đơn (chưa có file) → trả `id` |
| PATCH | `/:id` | (ownership) | sửa đơn khi `PENDING`/`RETURNED` (của chính mình) |
| POST | `/:id/attachments` | `payment_request:create` (+ownership) | upload 1 file (multipart, field `file`) |
| DELETE | `/:id/attachments/:attId` | (ownership) | xoá file khi `PENDING`/`RETURNED` |
| GET | `/:id/attachments/:attId/download` | `payment_request:view` (+scope) | stream file (RBAC, không signed URL) |
| POST | `/:id/approve` | `payment_request:approve` | tác động **bước hiện tại** |
| POST | `/:id/reject` | `payment_request:reject` | body `{ mode: 'return'\|'reject', note }` → `RETURNED` hoặc `REJECTED` (note bắt buộc) |
| POST | `/:id/resubmit` | (ownership) | sửa & gửi lại đơn `RETURNED` (vòng mới) |
| POST | `/:id/cancel` | (ownership) | huỷ đơn `PENDING`/`RETURNED` → `CANCELLED` |
| POST | `/:id/mark-paid` | `payment_request:mark_paid` | đơn `APPROVED` → `PAID` + `paymentNote` |
| GET | `/export` | `payment_request:export` | xuất Excel/CSV theo bộ lọc (iteration sau nếu cần) |

## Logic định tuyến (tái dùng `approval-routing.helper.ts` — generic, 0 thay đổi)

```
resolveFlow(employee, flowType=PAYMENT):
  flow = activeFlow(tenant, employee.departmentId, PAYMENT)
       ?? defaultFlow(tenant, PAYMENT)        // seed đảm bảo luôn tồn tại (2 bước cố định)
buildApprovalSnapshot(): auto-skip NO_APPROVER / SELF_APPROVAL / DUPLICATE_APPROVER (ROLE không skip)
advance(): hết step → APPROVED ; return → RETURNED ; reject → REJECTED (terminal)
```

## Tái sử dụng hạ tầng

| Thành phần | Chiến lược |
|-----------|-----------|
| `approval-routing.helper.ts` | **Dùng nguyên** (đã generic) |
| `approval-flow.service.ts` + repository | **Dùng nguyên**, lọc theo `flowType=PAYMENT` |
| Decision engine approve/return/resubmit | Trích/tái dùng helper chung; **bổ sung** nhánh `REJECTED` terminal |
| `PaymentRequestApproval` | Tạo mới song song `LeaveApproval`/`OvertimeApproval` |
| Storage driver (`CvStorageDriver`) | **Dùng nguyên** interface; thêm prefix `/uploads/payment`, mở rộng MIME ảnh, **bỏ** parse-text |
| Upload middleware (multer) | **Nhân bản** cho payment (MIME ảnh+pdf, ≤10MB) |
| `LeaveTimeline.tsx` | **Nhân bản** `PaymentTimeline.tsx` (thêm trạng thái REJECTED) |
| `CvUploader.tsx` | **Nhân bản** `PaymentAttachmentUploader.tsx` (multi-file, bỏ parse) |
| RBAC middleware/hook, Sidebar filter | **Dùng nguyên** |

## Permissions (thêm mới)

Thêm vào `PERMISSION_CATALOG` (`packages/shared/src/types/rbac.ts`):
```
payment_request: ['view', 'create', 'update', 'approve', 'reject', 'mark_paid', 'export']
```
Gán trong `apps/api/src/domain/rbac/catalog.ts` (chạy lại `seed-rbac-only.ts`):

| Role | Quyền payment_request |
|------|----------------------|
| `SUPER_ADMIN` (Founder) | `*` (implicit-all) |
| `HR_MANAGER` | view, create, approve, reject, mark_paid, export |
| `MANAGER` | view, create, approve, reject |
| `EMPLOYEE` | view, create |

> `approve`/`reject` ở MANAGER **cộng** kiểm tra "đúng người duyệt bước hiện tại" ở service
> (chỉ duyệt được đơn của cấp dưới mình). `mark_paid` cho HR_MANAGER vì HR thường kiêm kế toán.

## i18n

- Namespace mới `payment.json` (vi + en) cho toàn bộ chuỗi của feature.
- Bổ sung key vào `nav.json`: `groups.finance`, `items.paymentRequests`, `titles.paymentRequests`.

## Out of scope (iteration sau)

- Cấu hình luồng duyệt trong UI (luồng cố định seed sẵn; muốn đổi → sửa seed/DB).
- Duyệt theo **ngưỡng số tiền** / rẽ nhánh điều kiện.
- **Tạm ứng → quyết toán** (đối chiếu ADVANCE với chi tiêu thực, hoàn/thu lại chênh lệch).
- Tích hợp **Payroll** (cộng hoàn ứng vào phụ cấp kỳ lương).
- Đa tiền tệ + tỷ giá (giữ field `currency` nhưng mặc định VND, không quy đổi).
- Thông báo email/in-app khi chuyển cấp (chỉ chừa hook).
- Sửa/đảo trạng thái sau khi đã `PAID`; export PDF payslip-style.
- OCR hoá đơn / tự đọc số tiền từ ảnh.

## Non-functional

- **Tenant-scoped tuyệt đối**; RBAC **server-side**; mọi đổi trạng thái trong **transaction**.
- TDD cho routing/advance/return/reject; integration test RBAC theo cấp + scope.
- E2E critical-path: tạo đơn (REIMBURSEMENT) → manager duyệt → founder duyệt → mark paid;
  và nhánh manager **trả về** → NV sửa & gửi lại; assert **business outcome** (status + ai duyệt).
- File: validate MIME + size **ở server** (không tin client); private bucket, tải qua API + RBAC.
- WCAG AA, dark mode, i18n vi+en, design token (no hex), số dùng `tabular-nums`.

## Boundaries

### Always Do
- Enforce "đúng người duyệt bước hiện tại" ở **server**, không chỉ ẩn UI.
- Snapshot bước duyệt vào `PaymentRequestApproval` (đổi flow sau không làm sai đơn đang chạy).
- Validate loại file + dung lượng + **scan quyền** trước khi cho tải xuống.
- Note **bắt buộc** khi `Trả về` hoặc `Từ chối`.
- Auto-skip bước MANAGER khi NV chưa có manager (đi thẳng tới Founder) + ghi note.

### Never Do
- Không cho tự duyệt đơn của chính mình ở bước MANAGER/ROLE thông thường (trừ tình huống
  Founder ở trên, xử lý qua auto-skip).
- Không sửa/huỷ đơn đã `APPROVED`/`PAID`/`REJECTED`/`CANCELLED`.
- Không lưu file ra public bucket; không trả file mà không kiểm tra quyền + tenant.
- Không hardcode "Founder" bằng email trong logic — dùng `ROLE=super_admin` qua engine.
```
