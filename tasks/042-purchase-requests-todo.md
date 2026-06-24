# TODO: SPEC-042 Purchase Request

> Plan: [042-purchase-requests-plan.md](042-purchase-requests-plan.md) · Spec: [docs/specs/042-purchase-requests.md](../docs/specs/042-purchase-requests.md)

## Phase 0 — Foundation
- [x] 0.1 Prisma: enum `PURCHASE` + 4 model + back-relations + migration `20260624052742_purchase_requests`
- [x] 0.2 Shared types `purchase-request.ts` + export; RBAC catalog `purchase_request:*` (shared + api) + role grants
- [x] 0.3 Seed default `PURCHASE` flow (Manager→Founder) + reseed RBAC

### ✅ Checkpoint A: migrate+generate sạch · shared build pass · RBAC+flow seeded — DONE

## Phase 1 — Tạo + danh sách + chi tiết
- [x] 1.1 BE: validator + service (computeTotals per-line VAT, generateCode) + mappers + controller + routes + mount · **TDD totals & code** (34 unit pass)
- [x] 1.2 FE: scaffold feature + hooks + Page(tab Của tôi) + Table + Form(line-items động, tổng real-time) + DetailSheet + StatusBadge + router + sidebar + i18n `purchase` + nav keys

### ✅ Checkpoint B: tạo+xem phiếu có line items, tổng đúng (client & server) — VERIFIED (18.954.000/1.516.320/20.470.320 khớp file mẫu). Bug fix: unitPrice `step=1000`→`step="any"`

## Phase 2 — Luồng duyệt
- [x] 2.1 BE: approve / reject(return|reject) / resubmit / cancel + snapshot round + re-validate · **TDD advance/return/reject/auto-skip/self-approve**
- [x] 2.2 FE: tab Chờ duyệt + Tất cả + PurchaseTimeline + nút Duyệt/Trả về/Từ chối/Huỷ/Sửa&gửi lại

### ✅ Checkpoint C: vòng đời duyệt end-to-end — VERIFIED (Founder tự nộp → auto APPROVED đúng spec)

## Phase 3 — Đặt hàng + đính kèm
- [x] 3.1 BE: mark-ordered + attachments upload/delete/download (multer + storage `/uploads/purchase`)
- [x] 3.2 FE: modal "Đã đặt hàng" + PurchaseAttachmentUploader (multi-file, preview, tải)

### ✅ Checkpoint D: đặt hàng + chứng từ — VERIFIED (mark ordered → ORDERED + orderNote PO-2026-0123)

## Phase 4 — Thống kê + Excel
- [x] 4.1 BE: stats (tháng/trạng thái/phòng ban/NCC) + export.ts (ExcelJS, 1 dòng/phiếu) + routes · **TDD aggregate**
- [x] 4.2 FE: PurchaseStatsPanel (4 KPI + bar 12 tháng + breakdowns) + nút Xuất Excel

### ✅ Checkpoint E: thống kê + Excel — VERIFIED (KPI + chart T6 + theo trạng thái/phòng ban/NCC; .xlsx 17 cột + dòng TỔNG CỘNG)

## Phase 5 — Export PDF phiếu PO
- [x] 5.1 BE: po.pdf.ts (pdfkit + Be Vietnam Pro, layout file mẫu) + service renderPdf(company từ settings) + route `/:id/pdf` (3 unit + integration pass)
- [x] 5.2 FE: nút "Xuất PDF" (DetailSheet + row action)

### ✅ Checkpoint F: PDF khớp file mẫu (subtotal 18.954.000 / VAT 1.516.320 / tổng 20.470.320) — VERIFIED (render A4 khớp layout; filename PR-20260624-001.pdf). Polish: totals không wrap

## Phase 6 — Test & Review
- [x] 6.1 Critical path phủ bởi 13 integration test (create→duyệt→ordered, trả về→resubmit round+1, reject terminal, scope RBAC, cross-tenant 404, PDF, export) + manual E2E qua trình duyệt (screenshots) · i18n vi+en parity 155=155 · RBAC server-side verified · `/review` five-axis: **APPROVE, 0 Critical**
  - Fix sau review: client `round2` khớp server (utils.ts) — hết lệch nửa xu trên form
  - Còn lại (optional, nhất quán với payment): `purchase_request:update` permission/hook chưa nối UI; review-scope phân trang in-memory; UTC day boundary cho code/stats

### ✅ Checkpoint G (Ship) — READY
