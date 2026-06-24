# Plan: SPEC-042 Purchase Request (Phiếu đề xuất mua hàng)

> Spec: [docs/specs/042-purchase-requests.md](../docs/specs/042-purchase-requests.md)
> Strategy: **mirror module Payment Request (SPEC-041)** rồi thêm line-items + totals + code + PDF.
> Vertical slices — mỗi slice xuyên DB → API → UI và verify được.

## Integration points đã xác minh (read-only survey)

| Layer | File thật | Việc |
|------|-----------|------|
| Prisma | `apps/api/prisma/schema.prisma` (enum `ApprovalFlowType` dòng 110) | + value `PURCHASE`; 4 model mới; back-relations Employee/Tenant/ApprovalFlow |
| Shared types | `packages/shared/src/types/purchase-request.ts` + export ở `types/index.ts:11` | DTO/enum/request/response |
| RBAC | `packages/shared/src/types/rbac.ts` (catalog) + `apps/api/src/domain/rbac/catalog.ts` + seed | thêm `purchase_request:*` |
| Seed flow | `apps/api/src/domain/payment-request/defaults.ts` (khuôn) → `domain/purchase-request/defaults.ts` | seed flow `PURCHASE` 2 bước |
| API routes | `apps/api/src/app/routes/v1/payment-request.routes.ts` (khuôn) + mount ở `app/routes/index.ts` | `purchase-request.routes.ts` |
| API logic | `controllers/payment-request.controller.ts`, `domain/services/payment-request.service.ts`, `validators/payment-request.validator.ts`, `domain/payment-request/{export,mappers}.ts` | nhân bản → purchase-* |
| PDF | `apps/api/src/domain/payroll/payslip.pdf.ts` / `assets/handover.pdf.ts` (pdfkit + Be Vietnam Pro) | khuôn cho `domain/purchase-request/po.pdf.ts` |
| Company info | `apps/api/src/domain/services/settings.service.ts` (`Tenant.settings.company`) | nguồn header PDF |
| Web feature | `apps/web/src/features/payment-request/*` (7 components, hooks, page) | nhân bản → `features/purchase-request/*` + bảng line-items |
| Web router | `apps/web/src/router.tsx:189` | route `purchase-requests` |
| Sidebar | `apps/web/src/components/layout/Sidebar.tsx:85` (`groups.finance`) | + item `purchaseRequests` |
| i18n | `apps/web/src/i18n/index.ts` (ns array + imports) | + namespace `purchase` (vi+en) |

---

## Phase 0 — Foundation (contracts + DB + RBAC)

### Task 0.1 — Prisma schema + migration
- **Files:** `apps/api/prisma/schema.prisma`
- Thêm `PURCHASE` vào enum `ApprovalFlowType`; thêm 4 model (`PurchaseRequest`, `PurchaseRequestItem`, `PurchaseRequestApproval`, `PurchaseRequestAttachment`) đúng SPEC §Data Model; back-relations trên `Employee`, `Tenant`, `ApprovalFlow`.
- `pnpm --filter @hrm/api prisma migrate dev --name purchase_requests`.
- **Verify:** migrate chạy sạch; `prisma generate` không lỗi type.

### Task 0.2 — Shared types + RBAC catalog
- **Files:** `packages/shared/src/types/purchase-request.ts` (mới) + `types/index.ts`; `packages/shared/src/types/rbac.ts`; `apps/api/src/domain/rbac/catalog.ts`.
- Enum `PurchaseRequestStatus`, `PurchaseRequestScope`; DTO (`PurchaseRequestDto` + `Item`/`Approval`/`Attachment` DTO + `EmployeeDto`); request/response (Create/Update/Reject/MarkOrdered/Query/ListResponse/StatsResponse).
- `purchase_request: ['view','create','update','approve','reject','mark_ordered','export']`; gán role theo SPEC bảng Permissions.
- **Verify:** `pnpm --filter @hrm/shared build`; tsc sạch.

### Task 0.3 — Seed default PURCHASE flow + RBAC reseed
- **Files:** `apps/api/src/domain/purchase-request/defaults.ts` (mirror payment); hook vào seed flow + chạy seed RBAC.
- Flow 2 bước: Step1 `MANAGER`, Step2 `ROLE=super_admin`.
- **Verify:** sau seed, tenant có flow `PURCHASE`; role có quyền mới (query DB).

> **Checkpoint A:** migrate + generate sạch · shared build pass · RBAC + flow seeded.

---

## Phase 1 — Tạo phiếu + danh sách + chi tiết (vertical)

### Task 1.1 — Backend: create + totals + code + list/get
- **Files:** `validators/purchase-request.validator.ts`, `domain/services/purchase-request.service.ts`, `domain/purchase-request/mappers.ts`, `controllers/purchase-request.controller.ts`, `routes/v1/purchase-request.routes.ts` + mount.
- Logic tính tổng per-line VAT + round2 (SPEC §Logic tính tổng); sinh `code` PR-YYYYMMDD-NNN trong transaction; create (items replace), list scope mine/review/all + filter + tổng tiền, get (items+approvals+attachments).
- **TDD (RED→GREEN):** `computeTotals()` (per-line VAT, rounding, nhiều dòng) · `generateCode()` (seq/ngày/tenant, unique).
- **Verify:** unit pass; `POST /` tạo phiếu trả code + totals đúng; `GET /` lọc theo scope.

### Task 1.2 — Frontend: scaffold + tạo phiếu + list + detail (tab "Của tôi")
- **Files:** `features/purchase-request/{index.ts,utils.ts}`, `hooks/usePurchaseRequests.ts`, `pages/PurchaseRequestPage.tsx`, `components/{PurchaseRequestTable,PurchaseRequestForm,PurchaseRequestDetailSheet,PurchaseStatusBadge}.tsx`; `router.tsx`; `Sidebar.tsx`; `i18n/index.ts` + `locales/{vi,en}/purchase.json`; `locales/{vi,en}/nav.json` (+`items.purchaseRequests`,`titles.purchaseRequests`).
- Form Sheet rộng: bảng dòng hàng động (thêm/xoá), cột Thành tiền + dòng tổng (subtotal/VAT/total) **real-time client**; Detail Sheet hiển thị bảng dòng read-only + tổng.
- **Verify (preview):** tạo phiếu 3 dòng VAT khác nhau → tổng khớp; xuất hiện trong tab "Của tôi"; mở detail thấy items + tổng. Screenshot.

> **Checkpoint B:** user tạo + xem được phiếu với line items; tổng tính đúng cả client lẫn server.

---

## Phase 2 — Luồng duyệt (vertical)

### Task 2.1 — Backend: approve / reject(return|reject) / resubmit / cancel
- **Files:** service + controller + validator + routes (mở rộng).
- Tái dùng `approval-routing.helper.ts` + engine decision của payment (đã có nhánh REJECTED); snapshot `PurchaseRequestApproval` theo round; re-validate items khi resubmit.
- **TDD:** advance (bước cuối → APPROVED) · return → RETURNED + resubmit round+1 · reject → REJECTED terminal · auto-skip MANAGER khi không có manager · Founder tự nộp → auto-APPROVED.
- **Verify:** integration RBAC theo cấp + scope (403 khi sai người duyệt / scope=all thiếu quyền).

### Task 2.2 — Frontend: tab "Chờ tôi duyệt" + "Tất cả" + timeline + actions
- **Files:** `components/PurchaseTimeline.tsx`, mở rộng Page + DetailSheet + hooks.
- Tabs review/all theo quyền; nút Duyệt/Trả về(note)/Từ chối(note)/Huỷ/Sửa&gửi lại; timeline trạng thái (✓/⏳/↩/✕/⤼).
- **Verify (preview):** manager duyệt → founder duyệt → APPROVED; nhánh trả về → sửa → gửi lại. Screenshot timeline.

> **Checkpoint C:** vòng đời duyệt đầy đủ hoạt động end-to-end.

---

## Phase 3 — Đặt hàng + đính kèm (vertical)

### Task 3.1 — Backend: mark-ordered + attachments
- **Files:** service+controller+routes; upload middleware (multer) nhân bản cho purchase (MIME ảnh+pdf ≤10MB), storage prefix `/uploads/purchase`.
- `mark-ordered` (APPROVED→ORDERED + orderNote); upload/delete (PENDING/RETURNED) / download (RBAC+scope).
- **Verify:** integration mark-ordered gate quyền; upload/download đúng tenant + quyền.

### Task 3.2 — Frontend: nút "Đã đặt hàng" + uploader
- **Files:** `components/PurchaseAttachmentUploader.tsx`, mở rộng Form + DetailSheet.
- Modal mark-ordered (orderNote); uploader nhiều file + preview + xoá; tải file.
- **Verify (preview):** đính kèm báo giá; mark ordered → badge ORDERED. Screenshot.

> **Checkpoint D:** đặt hàng + chứng từ hoạt động.

---

## Phase 4 — Thống kê + Export Excel (vertical)

### Task 4.1 — Backend: stats + Excel
- **Files:** service `getStats()` (12 tháng + theo trạng thái + **phòng ban** + **NCC**, dùng `totalAmount`); `domain/purchase-request/export.ts` (ExcelJS, 1 dòng/phiếu, dòng TỔNG); routes `/stats`, `/export`.
- **TDD:** `aggregatePurchaseStats()` (pure) — buckets tháng/status/dept/vendor + grand/ordered/pending totals.
- **Verify:** `GET /stats` cấu trúc đúng; `GET /export` ra .xlsx mở được, tổng khớp.

### Task 4.2 — Frontend: tab "Thống kê" + nút "Xuất Excel"
- **Files:** `components/PurchaseStatsPanel.tsx`, hook `usePurchaseStats` + `exportPurchaseRequests`, mở rộng Page.
- KPI 4 thẻ + bar chart 12 tháng + breakdown trạng thái/phòng ban/NCC; nút export tôn trọng scope+filter.
- **Verify (preview):** tab Thống kê hiển thị; export tải file. Screenshot.

> **Checkpoint E:** thống kê + Excel hoạt động.

---

## Phase 5 — Export PDF phiếu PO (vertical)

### Task 5.1 — Backend: po.pdf.ts + GET /:id/pdf
- **Files:** `apps/api/src/domain/purchase-request/po.pdf.ts` (pdfkit + Be Vietnam Pro, mirror payslip); service `renderPdf()` (lấy company từ `settings.service`); route `/:id/pdf` (view+scope), filename `<code>.pdf`.
- Layout bám file mẫu: header công ty (name/address/phone/MST) · tiêu đề · lưới thông tin · **bảng dòng hàng** (auto page-break, lặp header) · tổng (subtotal/VAT/total) · ô ký.
- **Verify:** tải PDF mở được, tiếng Việt + ₫ render đúng, layout khớp mẫu; phiếu 3 dòng = subtotal 18.954.000, VAT 1.516.320, tổng 20.470.320.

### Task 5.2 — Frontend: nút "Xuất PDF"
- **Files:** DetailSheet + row action menu trong Table.
- **Verify (preview):** bấm Xuất PDF tải đúng file `<code>.pdf`.

> **Checkpoint F:** PDF khớp file mẫu, in được.

---

## Phase 6 — Test & Review (Ship-ready)

### Task 6.1 — E2E + review
- E2E critical path (Playwright): tạo phiếu 3 dòng → manager duyệt → founder duyệt → mark ordered → export PDF; nhánh trả về → sửa → gửi lại. Assert **business outcome** (status + totals + ai duyệt).
- Kiểm i18n vi+en parity (mọi key 2 ngôn ngữ); RBAC server-side; Design Checklist + Modern UI Checklist (dark mode, tabular-nums, no hex, a11y, skeleton/empty/error).
- `/review` five-axis trước khi báo done.

> **Checkpoint G (Ship):** tất cả test pass · i18n đủ · RBAC enforced · UI checklist xong.

---

## Thứ tự & rủi ro
1. **Foundation trước** (Phase 0) — mọi slice cần.
2. **Rủi ro cao làm sớm:** tính tổng per-line VAT (1.1) + sinh code + PDF layout (5.1) — TDD kỹ.
3. **Phụ thuộc:** P1→P0; P2→P1; P3,P4,P5→P1 (P2 không chặn P4/P5 nhưng nên xong P2 để có dữ liệu trạng thái cho stats/PDF). P6 cuối.
