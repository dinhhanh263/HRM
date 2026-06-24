# TODO: SPEC-041 — Payment Request

> Plan: `tasks/041-payment-requests-plan.md` · Spec: `docs/specs/041-payment-requests.md`

## Phase 1: Foundation (schema + types + RBAC)
- [x] 1.1 Schema: enums `PaymentRequestType`, `PaymentRequestStatus`; thêm `PAYMENT` vào `ApprovalFlowType`, `REJECTED` vào `ApprovalDecision`
- [x] 1.2 Schema: models `PaymentRequest`, `PaymentRequestApproval`, `PaymentRequestAttachment` + back-relations (`ApprovalFlow`, `Employee`, `Tenant`)
- [x] 1.3 Migration `payment_requests` chạy sạch (additive: 2 enum mới, 2 ADD VALUE, 3 bảng)
- [x] 1.4 `PERMISSION_CATALOG` thêm `payment_request: [view, create, update, approve, reject, mark_paid, export]`
- [x] 1.5 `catalog.ts`: gán quyền cho HR_MANAGER / MANAGER / EMPLOYEE; chạy `seed-rbac-only.ts` (verify DB)
- [x] 1.6 `packages/shared/.../payment-request.ts`: DTO + request/response types; export ở index

## Phase 2: Seed flow cố định
- [x] 2.1 `seedDefaultPaymentFlowForTenant`: flow PAYMENT 2 bước (MANAGER → ROLE super_admin), idempotent
- [x] 2.2 Gọi trong seed.ts + seed-rbac-only.ts (đồng bộ tenant hiện có) — verify 14/14 tenant, 0 trùng

## Checkpoint A — Foundation ✅
- [x] migration sạch · `tsc` (api+web) + build shared pass · seed RBAC + flow PAYMENT idempotent · Leave/OT không regression

## Phase 3: Backend core (create + routing + list + detail) [RISK] ✅
- [x] 3.1 repository: `createWithApprovals`, `findByIdWithApprovals`, `findAll`(+filter+tổng tiền), `findReviewCandidates` (+ recordDecision/resubmit cho Slice 5)
- [x] 3.2 service `create()`: validate-by-type → resolveFlow(PAYMENT) → snapshot → tạo; Founder/role tự thoả → SELF_APPROVAL → auto APPROVED
- [x] 3.3 service `list(scope)` + `listReview` + `getById` (owner / review-capability)
- [x] 3.4 validator Zod (create/update theo type, amount>0, reject mode)
- [x] 3.5 controller + routes `GET /`, `GET /:id`, `POST /`, `PATCH /:id` + `requirePermission`; mount vào routes/index.ts
- [x] 3.6 mapper `toPaymentRequestDto` (+ approval/attachment)
- [x] 3.7 unit test (7) routing/Founder-auto-approve/scope + smoke test DB thật + 608/608 unit pass (zero regression)

## Phase 4: Đính kèm hoá đơn/bill [RISK] ✅
- [x] 4.1 `payment.config.ts` (MIME ảnh+pdf, 10MB, max 10 file, prefix `/uploads/payment`)
- [x] 4.2 Factory blob-storage generic (CV giữ nguyên, zero-regression) + facade `payment-storage`
- [x] 4.3 `payment-upload.middleware.ts` (multer single 'file', MIME ảnh+pdf)
- [x] 4.4 service `addAttachment` / `removeAttachment` / `getDownload` (ownership + state + MIME + max-files)
- [x] 4.5 controller + routes `POST /:id/attachments`, `DELETE /:id/attachments/:attId`, `GET /:id/attachments/:attId/download`
- [x] 4.6 unit test blob-storage (6) + smoke test upload/download/delete DB thật + 614/614 unit pass; storage/ gitignored

## Phase 5: Decision engine (vòng đời đầy đủ) [RISK core] ✅
- [x] 5.1 `approve(actor)` — match bước hiện tại + advance/finalize + self-review guard
- [x] 5.2 `respond(mode)` — `return` → RETURNED · `reject` → REJECTED terminal (note bắt buộc)
- [x] 5.3 `resubmit` (RETURNED → round+1, re-route + Founder self-approve) · `cancel` (PENDING/RETURNED → CANCELLED)
- [x] 5.4 `markPaid` (APPROVED → PAID, gate `payment_request:mark_paid`)
- [x] 5.5 repository `recordDecision`/`resubmit`/`update` (transaction); `buildApprovalActor`; fallback flowId=null
- [x] 5.6 routes `POST /:id/{approve,reject,resubmit,cancel,mark-paid}`

## Checkpoint B — Backend lifecycle ✅
- [x] create→approve×2→APPROVED→PAID · return→resubmit(round2) · reject terminal chặn resubmit · self-review/wrong-approver chặn — unit (21) + smoke DB thật · 628/628 unit pass

## Phase 6: Frontend UI ✅
- [x] 6.1 feature `payment-request/`: hooks (list/detail/create/update/upload/delete/approve/respond/resubmit/cancel/markPaid)
- [x] 6.2 utils.ts (formatPaymentDate); types từ @hrm/shared
- [x] 6.3 `PaymentRequestForm` (Sheet, field theo loại) + `PaymentAttachmentUploader` (multi-file, download/delete)
- [x] 6.4 `PaymentTimeline` (+REJECTED) + `PaymentStatusBadge` (+paid teal) + `PaymentRequestTable` + `PaymentRequestDetailSheet`
- [x] 6.5 `PaymentRequestPage` (tabs mine/review/all + filter + tổng tiền + action theo quyền)
- [x] 6.6 Sidebar: nhóm `groups.finance` + item `items.paymentRequests` (icon Receipt)
- [x] 6.7 router.tsx: route `payment-requests` + `RequirePermission`
- [x] 6.8 i18n `payment.json` (vi+en) + bổ sung `nav.json` + đăng ký namespace

## Checkpoint C — UI golden path ✅
- [x] Employee tạo đơn → PENDING (manager auto-skip) → Admin/Founder duyệt → APPROVED → mark paid → PAID (screenshots) · dark mode · RBAC ẩn/hiện nút đúng (employee thấy Huỷ; admin thấy Duyệt/Trả về/Từ chối→Đã thanh toán) · 0 console error

## Phase 7: Tests ✅
- [x] 7.1 Unit (27): routing snapshot/auto-skip, Founder auto-approve, advance/finalize, return round+1, reject terminal, validate-by-type, blob-storage
- [x] 7.2 Integration (12, Supertest): RBAC+scope (employee all→403, mine isolated, founder all, manager review queue), approve/respond đúng/sai actor, mark-paid perm, upload MIME, download, cross-tenant 404
- [x] 7.3 E2E critical-path: HTTP create→manager approve→founder approve→APPROVED→mark-paid→PAID assert paidBy/note; return→resubmit round2; reject terminal → resubmit chặn. + verify UI thật (Slice 6 screenshots)

## Checkpoint D — Done ✅
- [x] Toàn bộ 1334 test (110 file) xanh · không regression Leave/OT/CV · web+api tsc 0 · UI golden path verify screenshot · dark mode · RBAC đúng

## Phase 8: Thống kê theo tháng/năm (bổ sung theo yêu cầu HR) ✅
- [x] 8.1 shared DTO `PaymentStatsResponse` (months[12] + byType + byStatus + grand/paid/pending)
- [x] 8.2 repository `findForStats` + service `getStats` + helper thuần `aggregatePaymentStats` (unit-test)
- [x] 8.3 route `GET /payment-requests/stats` (trước `/:id`) + controller gate review-capability (company-wide)
- [x] 8.4 hook `usePaymentStats` + `PaymentStatsPanel` (year selector + KPI cards + bar chart CSS theo tháng + breakdown loại/trạng thái) + tab "Thống kê" (chỉ HR/Founder)
- [x] 8.5 i18n vi+en; unit (2) + integration (1, RBAC employee→403/founder→200) ; verify UI screenshot (KPI + chart scale + breakdown) ; 1337 test xanh

## Phase 9: Export Excel theo filter (bổ sung theo yêu cầu HR) ✅
- [x] 9.1 `export.ts` dựng workbook ExcelJS (cột VN, amount numeric + dòng TỔNG CỘNG)
- [x] 9.2 repository `findAllForExport` (không phân trang) + service `getExportRows` (tôn trọng scope mine/review/all + status/type/date/search)
- [x] 9.3 route `GET /payment-requests/export` (trước `/:id`) gate `payment_request:export`; controller stream xlsx theo đúng filter
- [x] 9.4 frontend: `exportPaymentRequests()` tải blob + nút "Xuất Excel" trên toolbar (gate export, theo filter tab hiện tại) + i18n
- [x] 9.5 integration (2): MANAGER/employee→403, founder→xlsx hợp lệ (PK header, content-type, filename) ; verify UI nút + tải không lỗi ; 1339 test xanh
