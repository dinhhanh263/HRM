# Plan: SPEC-041 — Payment Request (Yêu cầu thanh toán / Hoàn ứng)

> Nguồn: `docs/specs/041-payment-requests.md` (Approved 2026-06-23)
> NV tạo đơn yêu cầu thanh toán + đính kèm hoá đơn/bill → chuỗi duyệt cố định
> **NV → Quản lý → Founder** → đánh dấu **đã thanh toán** thủ công.
> Tái dùng tối đa routing engine (Leave/OT) + hạ tầng lưu file GCS (SPEC-039).

## 1. Bối cảnh & Chiến lược tái dùng

Tính năng **mới hoàn toàn** (không có legacy), nhưng đi theo đúng pattern multi-step
đã kiểm chứng ở Leave (SPEC-005) và OT (SPEC-023). Luồng **cố định, không có UI cấu
hình** (khác Leave/OT) → seed sẵn 1 flow `PAYMENT` 2 bước cho mỗi tenant.

| Hạ tầng | Quyết định cho Payment |
|---------|------------------------|
| `approval-routing.helper.ts` (resolveFlow / resolveApprover / buildApprovalSnapshot / findNextActiveStep / matchesApprover) | **Tái dùng nguyên, 0 thay đổi** — đã generic |
| `ApprovalFlow` + `ApprovalStep` | **Tái dùng model**; thêm `PAYMENT` vào enum `ApprovalFlowType`; seed flow mặc định (không UI cấu hình) |
| `approval-flow.service.ts` + `repository` | **Tái dùng** với tham số `flowType=PAYMENT` (đã có sẵn tham số từ SPEC-023) |
| `LeaveApproval` / `OvertimeApproval` | **Nhân bản** model mới `PaymentRequestApproval` (cùng shape) |
| Decision engine (approveStep/returnStep) | **Nhân bản logic** sang `payment-request.service.ts`; **bổ sung** nhánh `REJECTED` terminal |
| Storage driver (`cv-storage.ts` / `gcs-cv-storage.ts` / `local-cv-storage.ts`) | **Tái dùng interface**; thêm prefix `/uploads/payment`, mở rộng MIME ảnh, bỏ parse-text |
| Upload middleware (`cv-upload.middleware.ts`) | **Nhân bản** `payment-upload.middleware.ts` (MIME ảnh+pdf, ≤10MB) |
| Download stream + RBAC (`candidate.controller` download) | **Tái dùng pattern** stream qua API, không signed URL |
| `LeaveTimeline.tsx` | **Nhân bản** `PaymentTimeline.tsx` (+ trạng thái REJECTED) |
| `CvUploader.tsx` | **Nhân bản** `PaymentAttachmentUploader.tsx` (multi-file, bỏ parse/poll) |
| RBAC middleware (`requirePermission`) + hook (`usePermission`) + Sidebar filter | **Dùng nguyên** |

## 2. Mô hình quyết định (chốt từ spec)

- Luồng cố định 2 bước: `Bước 1 = MANAGER` (Employee.managerId), `Bước 2 = ROLE = super_admin` (Founder).
- **Founder tự nộp đơn** → mọi bước auto-skip → đơn **tự APPROVED** (không cần ai duyệt).
- Hai hành động phản hồi: `Trả về` → `RETURNED` (sửa & gửi lại, round+1); `Từ chối` → `REJECTED` **terminal**.
- Sau `APPROVED` → `mark_paid` (HR_MANAGER + SUPER_ADMIN) → `PAID` (terminal).
- 3 loại đơn dùng 1 model, field tuỳ-loại nullable.

## 3. Trạng thái hiện tại (đã verify)

- Route backend mount tại `apps/api/src/app/routes/index.ts` (thêm `router.use('/payment-requests', …)`).
- Router frontend `apps/web/src/router.tsx` (thêm entry `payment-requests` + `RequirePermission`).
- RBAC: `PERMISSION_CATALOG` ở `packages/shared/src/types/rbac.ts`; gán role ở `apps/api/src/domain/rbac/catalog.ts` (`SYSTEM_ROLES`, mỗi role `permissions: string[]`).
- `ApprovalFlowType { LEAVE OVERTIME }`, `ApprovalDecision { APPROVED RETURNED AUTO_SKIPPED }` — cần thêm `PAYMENT` / `REJECTED`.
- `approval-flow.repository/service` đã nhận tham số `flowType` (từ SPEC-023) → tái dùng cho PAYMENT.
- Storage config `apps/api/src/shared/configs/cv.config.ts` (`STORAGE_DRIVER`, `GCS_BUCKET`).
- Sidebar `apps/web/src/components/layout/Sidebar.tsx` (mảng `navGroups`); i18n `nav.json`.

## 4. Vertical slices (foundation-first, risk-first)

### Slice 1 — Schema + shared types + RBAC (Foundation)
**Mục tiêu:** DB & type & permission nền sẵn sàng; build pass; chưa đổi hành vi runtime.

Files:
- `apps/api/prisma/schema.prisma`:
  - `enum PaymentRequestType { REIMBURSEMENT ADVANCE VENDOR_PAYMENT }`
  - `enum PaymentRequestStatus { PENDING APPROVED REJECTED RETURNED CANCELLED PAID }`
  - `enum ApprovalFlowType` thêm `PAYMENT`; `enum ApprovalDecision` thêm `REJECTED`.
  - Model `PaymentRequest`, `PaymentRequestApproval`, `PaymentRequestAttachment` (theo spec §Data Model).
  - `ApprovalFlow`: back-relation `paymentRequests PaymentRequest[]`.
  - `Employee`: back-relation `paymentRequests PaymentRequest[] @relation("EmployeePaymentRequests")`.
- Migration: `pnpm --filter @hrm/api prisma migrate dev --name payment_requests`.
- `packages/shared/src/types/rbac.ts`: `PERMISSION_CATALOG` thêm `payment_request: ['view','create','update','approve','reject','mark_paid','export']`.
- `apps/api/src/domain/rbac/catalog.ts`: gán quyền payment_request cho HR_MANAGER / MANAGER / EMPLOYEE (super_admin = `*`).
- `packages/shared/src/types/payment-request.ts` (mới): `PaymentRequestType`, `PaymentRequestStatus`, `PaymentRequestDto`, `PaymentRequestApprovalDto`, `PaymentRequestAttachmentDto`, request/response types; export ở `packages/shared/src/index.ts`.

**AC:** `pnpm build` + `tsc` pass; migration chạy sạch; `seed-rbac-only.ts` thêm quyền mới idempotent; chưa có route/UI.

---

### Slice 2 — Seed flow PAYMENT mặc định (Foundation, nhỏ)
**Mục tiêu:** Mỗi tenant luôn có 1 flow `PAYMENT` 2 bước cố định (idempotent), để routing có gì để resolve.

Files:
- `apps/api/src/domain/rbac/...` hoặc seed helper: hàm `ensureDefaultPaymentFlow(tenantId)` tạo `ApprovalFlow(flowType=PAYMENT, departmentId=null)` + 2 `ApprovalStep`:
  - step 0: `approverType = MANAGER`
  - step 1: `approverType = ROLE`, `roleKey = 'super_admin'`
- Gọi trong: `seed.ts` (per tenant) + `seed-rbac-only.ts` (đồng bộ tenant hiện có) + tenant-bootstrap (khi tạo tenant mới, nếu có).
- Idempotent: upsert theo `@@unique([tenantId, departmentId, flowType])`.

**AC:** Chạy seed → mọi tenant có đúng 1 flow PAYMENT 2 bước; chạy lại không tạo trùng; Leave/OT flow không đổi.

---

### Slice 3 — Tạo đơn + routing snapshot + list(scope) + detail (RISK: cốt lõi) [RBAC]
**Mục tiêu:** NV tạo đơn → sinh snapshot duyệt; xem list theo scope; xem chi tiết + timeline.

Files (backend mới, theo cấu trúc domain/app):
- `apps/api/src/domain/repositories/payment-request.repository.ts`: `createWithApprovals` (transaction), `findByIdScoped` (kèm approvals + attachments), `list` (filter status/type/amount/date + pagination + tổng tiền), `findReviewCandidates(actor)`.
- `apps/api/src/domain/services/payment-request.service.ts`:
  - `create()` → validate theo type → `resolveFlow(flowType=PAYMENT)` → `buildApprovalSnapshot` → `snapshotToApprovals` → `createWithApprovals`. Nếu **mọi bước auto-skip** → status `APPROVED`, currentStep cuối+1 (Founder tự nộp).
  - `list(scope)` + `getById` (owner luôn xem; người khác cần review-capability).
- `apps/api/src/app/validators/payment-request.validator.ts`: Zod schema create/update theo type (amount>0, field bắt buộc theo loại).
- `apps/api/src/app/controllers/payment-request.controller.ts`: `list` (scope mine/review/all), `getById`, `create`, `update` (ownership, PENDING/RETURNED).
- `apps/api/src/app/routes/v1/payment-request.routes.ts`: `GET /`, `GET /:id`, `POST /`, `PATCH /:id` + `requirePermission`.
- Đăng ký route ở `apps/api/src/app/routes/index.ts`.
- Mapper `toPaymentRequestDto` (kèm approvals/attachments).

**AC:** EMPLOYEE tạo đơn → 2 approval rows, PENDING, currentStep=1. Founder tạo đơn → APPROVED ngay. `scope=all` chỉ ai có approve; role khác → 403. GET /:id trả timeline. Owner xem đơn mình OK.

---

### Slice 4 — Đính kèm hoá đơn/bill (upload/list/download/delete) (RISK: file) [RBAC]
**Mục tiêu:** NV upload nhiều ảnh/PDF cho đơn; tải/xoá có kiểm soát quyền + tenant.

Files:
- `apps/api/src/shared/configs/payment.config.ts` (mới): `PAYMENT_MAX_FILE_BYTES=10MB`, `PAYMENT_ALLOWED_MIME` (image/jpeg, image/png, image/webp, application/pdf), `PAYMENT_MAX_FILES=10`, `PAYMENT_URL_PREFIX='/uploads/payment'`.
- `apps/api/src/infrastructure/storage/payment-storage.ts` (mới, mỏng): tái dùng driver `cv-storage` interface nhưng store vào prefix `payment/`; hoặc generalize driver hiện có nhận `subdir`. **Ưu tiên** tổng quát hoá nhẹ driver (thêm tham số `keyPrefix`) để không nhân đôi GCS code.
- `apps/api/src/app/middlewares/payment-upload.middleware.ts` (mới): nhân bản `cv-upload.middleware.ts` với MIME ảnh+pdf, `single('file')`.
- `payment-request.service.ts`: `addAttachment` (validate đơn PENDING/RETURNED + ownership, đếm ≤ MAX_FILES), `removeAttachment`, `getDownload` (scope-checked stream).
- `payment-request.repository.ts`: attachment create/delete/findScoped.
- `payment-request.controller.ts`: `uploadAttachment`, `deleteAttachment`, `downloadAttachment`.
- Routes: `POST /:id/attachments`, `DELETE /:id/attachments/:attId`, `GET /:id/attachments/:attId/download`.

**AC:** Upload JPG/PNG/PDF ≤10MB OK; file sai loại/quá lớn → 400; >10 file → 400. Download stream đúng RBAC + tenant; người không có quyền xem đơn → 403/404. Xoá file chỉ khi PENDING/RETURNED + owner.

---

### Slice 5 — Decision engine: approve / return / reject / resubmit / cancel / mark-paid (RISK: core) [RBAC]
**Mục tiêu:** Vòng đời đầy đủ qua API.

Files:
- `payment-request.service.ts`:
  - `approve(actor)` → matchesApprover bước hiện tại + `payment_request:approve` → ghi APPROVED → advance/finalize (hết bước → status APPROVED, reviewedAt).
  - `decideReturn(actor, note)` → RETURNED + note bắt buộc.
  - `decideReject(actor, note)` → REJECTED terminal + note bắt buộc.
  - `resubmit(owner, input)` → chỉ RETURNED → re-validate → re-resolve flow → round+1, currentStep reset, PENDING.
  - `cancel(owner)` → PENDING/RETURNED → CANCELLED.
  - `markPaid(actor, note)` → chỉ APPROVED + `payment_request:mark_paid` → PAID + paidAt/paidById/paymentNote.
- `payment-request.repository.ts`: `recordDecision` (transaction), `markPaid`, `resubmit` (transaction giữ round cũ).
- `payment-request.controller.ts` + routes: `POST /:id/approve`, `POST /:id/reject` (body `{mode:'return'|'reject', note}`), `POST /:id/resubmit`, `POST /:id/cancel`, `POST /:id/mark-paid`.
- `buildApprovalActor(req)` (tái dùng pattern Leave/OT: employeeId/roleKey/isSuperAdmin).

**AC:** Manager duyệt bước 1 → currentStep=2; Founder duyệt bước cuối → APPROVED. Return → RETURNED + note → resubmit round 2. Reject → REJECTED terminal (resubmit chặn). Sai người duyệt → 403/422. mark-paid chỉ trên APPROVED bởi HR/Founder → PAID.

---

### Slice 6 — Frontend UI
**Mục tiêu:** Nhóm "Tài chính" + trang quản lý đơn end-to-end.

Files:
- `apps/web/src/features/payment-request/` (mới):
  - `api.ts` / `hooks/usePaymentRequests.ts`: query keys + hooks (list scope, detail, create, update, upload/delete attachment, approve, reject(return/reject), resubmit, cancel, markPaid) — optimistic + invalidate.
  - `schema.ts` (Zod theo type), `types.ts`.
  - `components/`: `PaymentRequestForm.tsx` (Sheet, field theo loại), `PaymentAttachmentUploader.tsx` (multi-file, preview, xoá — nhân bản CvUploader bỏ parse), `PaymentTimeline.tsx` (nhân bản LeaveTimeline + REJECTED), `PaymentStatusBadge.tsx`, `PaymentRequestTable.tsx`, `PaymentRequestDetailSheet.tsx`.
  - `pages/PaymentRequestPage.tsx`: tabs `Đơn của tôi` / `Chờ tôi duyệt` (nếu can approve) / `Tất cả` (nếu scope all); toolbar filter (status/type/amount/date) + tổng tiền; nút hành động theo trạng thái+quyền.
  - `index.ts`.
- `apps/web/src/components/layout/Sidebar.tsx`: thêm nhóm `groups.finance` + item `items.paymentRequests` (icon `Receipt`, href `/payment-requests`, permission `payment_request:view`).
- `apps/web/src/router.tsx`: route `payment-requests` bọc `RequirePermission permission="payment_request:view"` (lazy import + Suspense theo pattern hiện có).
- i18n: `apps/web/src/i18n/locales/{vi,en}/payment.json` (mới); bổ sung `nav.json`: `groups.finance`, `items.paymentRequests`, `titles.paymentRequests`.

**AC (verify bằng screenshot trên localhost):** golden path — EMPLOYEE tạo đơn REIMBURSEMENT + upload 2 ảnh → Manager thấy ở "Chờ tôi duyệt" → duyệt → Founder duyệt → APPROVED → mark paid → PAID. Nhánh Manager "Trả về" → NV thấy RETURNED + note → sửa & gửi lại. Dark mode + i18n vi/en + skeleton/empty/error; ẩn nút theo quyền; thiếu quyền → 403 page.

---

### Slice 7 — Tests (TDD + critical-path E2E)
- Unit (Vitest): routing snapshot (auto-skip MANAGER khi không có manager; Founder tự nộp → APPROVED), advance/finalize, return round+1, reject terminal, validate theo type, đếm file ≤ MAX.
- Integration (Supertest): RBAC + scope `/payment-requests` (EMPLOYEE vs MANAGER vs SUPER_ADMIN); approve/return/reject bằng đúng/sai actor; upload MIME/size; download cross-tenant chặn.
- E2E critical-path: seed flow + 3 user (NV/Manager/Founder) → tạo đơn → duyệt 2 bước → mark paid → **assert status PAID + ai duyệt từng bước + paidBy** (business outcome, KHÔNG quote coverage%). Nhánh return→resubmit assert round=2.

## 5. Checkpoints

- **CP-A (sau Slice 2):** migration sạch, build/tsc pass, seed RBAC + flow PAYMENT idempotent, Leave/OT không regression.
- **CP-B (sau Slice 5):** vòng đời Payment đầy đủ qua API (create→approve×2→APPROVED→PAID; return→resubmit; reject terminal) verify bằng test.
- **CP-C (sau Slice 6):** UI golden path verify bằng screenshot; RBAC ẩn/hiện + 403 đúng; upload/preview/download chạy.
- **CP-D (sau Slice 7):** critical-path E2E xanh; không regression Leave/OT.

## 6. Rủi ro & giảm thiểu

- **Founder tự nộp đơn → auto APPROVED:** logic "mọi bước skip → APPROVED" phải test riêng; tránh đơn kẹt PENDING không ai duyệt.
- **Tổng quát hoá storage driver** (thêm `keyPrefix`) có thể đụng CV hiện tại → thêm tham số **optional default 'cv'**, giữ chữ ký cũ; test CV upload vẫn xanh (regression).
- **`ApprovalDecision` thêm REJECTED** là additive → kiểm tra UI Leave/OT timeline không vỡ khi gặp enum mới (chỉ Payment sinh REJECTED).
- **Multi-file upload**: validate số lượng + size **ở server**, không tin client; transaction khi tạo đơn + đính kèm tách bước (đơn tạo trước, file upload sau theo `:id`).
- **Không refactor Leave/OT** → chấp nhận trùng lặp code (đúng chủ trương, ưu tiên zero-regression).
