# PLAN — SPEC-045 Sales / CRM (B2B + B2C)

> Vertical slices, không horizontal layers. Mỗi task đi xuyên DB → API → UI và verify được.
> Nguồn: [docs/specs/045-sales-crm.md](../docs/specs/045-sales-crm.md)

## Quyết định chốt khi planning (amend nhẹ spec)

| # | Quyết định | Lý do |
|---|---|---|
| D1 | **RBAC single-colon**: resource `sales`, action gói sub-entity (`customer_view`, `customer_create`, `customer_update`, `customer_assign`, `deal_view`, `deal_create`, `deal_update`, `deal_move`, `product_view`, `product_manage`, `quote_view`, `quote_manage`, `task_view`, `task_manage`, `email_send`, `template_manage`, `report_view`, `view_all`, `settings`) | Khớp `PERMISSION_CATALOG` thật (`packages/shared/src/types/rbac.ts`). Spec viết double-colon là sai convention. |
| D2 | `SALES_REP` / `SALES_MANAGER` = **system role theo key** (như `payroll_approver`), gán qua custom-role (SPEC-014) | Tránh migration `UserRole` enum trên bảng `users` — ít xâm lấn, đảo ngược dễ |
| D3 | Giai đoạn 1 seed **1 pipeline mặc định dùng chung**; model hỗ trợ nhiều pipeline nhưng UI multi-pipeline để Tier 2 | Simplest thing that works; giảm bề mặt UI |
| D4 | `Deal.amount` = `Decimal(18,2)`, **đồng bộ từ Quote chính trong transaction**; không sửa tay | Tránh sai lệch tiền; bài học line-item |
| D5 | `owner`/`assignee` tham chiếu **`Employee`** (không phải `User`) — đồng nhất với recruitment hiring-team/probation | Nhất quán domain |

## Pattern bám theo (file thật)

- **API module**: `apps/api/src/domain/<module>/` (defaults.ts, mappers.ts, *.pdf.ts, export.ts) +
  `app/routes/v1/<module>.routes.ts` + `app/controllers` + `app/validators` (Zod) + `app/middlewares`.
- **Route mount**: `apps/api/src/app/routes/index.ts` → `router.use('/sales', salesRoutes)`; router `.use(authenticate)`.
- **RBAC**: catalog ở `packages/shared/src/types/rbac.ts`; grants ở `apps/api/src/domain/rbac/catalog.ts` (`SYSTEM_ROLES`); seed qua `apps/api/src/scripts/seed-rbac.ts`.
- **Seed defaults**: `seedDefaultSalesPipelineForTenant(prisma, tenantId)` trong `domain/sales/defaults.ts`, gọi trong `seed-rbac.ts` vòng lặp tenant.
- **Reminders**: `domain/reminders/` (queue + scan + worker) — task follow-up cắm vào đây.
- **Email**: `infrastructure/email/email.provider.ts` (Resend); gửi async qua BullMQ như `reminder-email.worker.ts`.
- **PDF**: pattern `domain/purchase-request/po.pdf.ts` cho Quote PDF.
- **Web feature**: `apps/web/src/features/sales/` (components, hooks, pages, lib, index.ts); routes ở `router.tsx`; nav ở `components/layout/Sidebar.tsx`; i18n `i18n/locales/{vi,en}/sales.json`.
- **Kanban**: tái dùng pattern `features/recruitment/components/JobPipelineBoard.tsx` + `lib/pipeline-drop.ts`.

---

## Phase 0 — Foundation

### Task 0.1 — Prisma schema + migration cho toàn bộ model Sales
**Objective:** Có nền dữ liệu để mọi slice sau cắm vào.
**Files:** `apps/api/prisma/schema.prisma` (thêm 11 enum + 12 model theo spec; back-relations vào `Tenant`, `Employee`, `IssuingEntity`); migration mới.
**Acceptance:**
- [ ] Thêm enums + models (SalesCompany, Customer, SalesPipeline, SalesStage, Deal, DealStageHistory, Product, Quote, QuoteItem, SalesActivity, SalesTask, SalesEmailTemplate, SalesEmailMessage)
- [ ] Tiền dùng `Decimal(18,2)`; mọi bảng `tenantId` + index `[tenantId, ...]`
- [ ] `pnpm --filter @hrm/api prisma migrate dev --name add_sales_crm` chạy sạch; `prisma generate` OK
**Deps:** —
**Verification:** migrate chạy; `tsc` ở api pass; Prisma Studio thấy bảng.

### Task 0.2 — RBAC catalog + system roles Sales
**Objective:** Quyền `sales:*` + 2 role nghiệp vụ sẵn sàng seed.
**Files:** `packages/shared/src/types/rbac.ts` (thêm key `sales` — D1); `apps/api/src/domain/rbac/catalog.ts` (thêm `SALES_REP`, `SALES_MANAGER` vào `SYSTEM_ROLES` theo key — D2; `hr_manager` += sales:*).
**Acceptance:**
- [ ] `PERMISSION_CATALOG.sales` đủ 19 action (D1)
- [ ] `SALES_MANAGER`: tất cả `sales:*` trừ `settings` + có `view_all`; `SALES_REP`: không `view_all`/`settings` (xem spec Permissions)
- [ ] `hr_manager` nhận thêm `sales:*`
- [ ] `pnpm --filter @hrm/api db:seed:rbac` idempotent, không lỗi
**Deps:** —
**Verification:** seed chạy; query DB thấy permission + role grants; web `usePermission` nhận key mới (type-check).

### Task 0.3 — Scaffold domain + router + seed pipeline mặc định
**Objective:** Khung API `/api/v1/sales` + pipeline mặc định mỗi tenant.
**Files:** `apps/api/src/domain/sales/defaults.ts` (`seedDefaultSalesPipelineForTenant` — 1 pipeline "Mặc định" + stages NEW/QUALIFYING/PROPOSAL/NEGOTIATION/WON/LOST kèm probability); `app/routes/v1/sales.routes.ts` (authenticated, rỗng); `app/routes/index.ts` (mount); gọi seed trong `scripts/seed-rbac.ts`.
**Acceptance:**
- [ ] `/api/v1/sales` mounted, yêu cầu auth
- [ ] Mỗi tenant có đúng 1 pipeline default sau seed (idempotent — không tạo trùng)
**Deps:** 0.1, 0.2
**Verification:** gọi endpoint của router; seed lại lần 2 không nhân đôi pipeline.

---
## ✅ Checkpoint: Foundation — schema migrate, RBAC seed, router mounted, default pipeline tồn tại. `tsc` + seed sạch.
---

## Phase 1 — Khách hàng, Lead lifecycle, Ownership (risk-first: scoping)

### Task 1.1 — Customer CRUD + owner-scoped list + dedupe
**Objective:** Quản lý danh sách khách + chi tiết; rep chỉ thấy của mình + Lead Pool.
**Files:** API: `domain/sales/customer.service.ts`, `customer.repository.ts`, `app/controllers/sales-customer.controller.ts`, `app/validators/sales-customer.validator.ts`, routes. Web: `features/sales/api.ts`+`hooks/useCustomers.ts`, `pages/CustomerListPage.tsx`, `pages/CustomerDetailPage.tsx` (shell tabs), `components/CustomerFormSheet.tsx`, `components/CustomerTable.tsx`, `LifecycleBadge.tsx`.
**Acceptance:**
- [ ] CRUD Customer (type B2B/B2C, fields theo spec); list search (bỏ dấu)/filter(type,lifecycle,source,owner)/sort/pagination **server-side**
- [ ] **Owner-scope server-side**: thiếu `sales:view_all` ⇒ chỉ `ownerId = me OR ownerId = null`
- [ ] **Dedupe** email→phone→fuzzy name (+company B2B): trùng → 409 + gợi ý merge
- [ ] Gate `sales:customer_view|customer_create|customer_update`
**Deps:** 0.3
**Verification:** unit dedupe + scope; integration list theo 2 role; UI skeleton/empty/error.

### Task 1.2 — Lead Pool + claim/assign/reassign/bulk + OWNER_CHANGED
**Objective:** Trả lời "lead này của ai" + phân công.
**Files:** API: `customer.service` (claim/assign/bulkAssign + ghi `SalesActivity` OWNER_CHANGED), controller/routes. Web: `components/AssignOwnerDialog.tsx`, Lead Pool view (filter owner=null), bulk-action bar.
**Acceptance:**
- [ ] Rep claim lead từ pool về mình; manager/admin assign/reassign + bulk assign
- [ ] Mọi đổi owner ghi `SalesActivity` type `OWNER_CHANGED` {from,to,by} + set `assignedAt`
- [ ] Gate `sales:customer_assign` cho gán người khác
- [ ] ⚠️ Review#2: reassign phải bao **cả Deal + SalesTask** của owner cũ (không chỉ Customer) — vì `deal.owner`/`task.assignee` là FK `RESTRICT`, không reassign sẽ chặn offboard nhân viên
**Deps:** 1.1
**Verification:** unit + integration assign ghi activity; UI bulk assign từ Lead Pool.

### Task 1.3 — Đổi lifecycle status (+ lý do khi DISQUALIFIED)
**Objective:** Vòng đời lead rõ ràng, tách khỏi deal stage.
**Files:** API: `customer.service.changeLifecycle` (+Activity LIFECYCLE_CHANGED); controller `/customers/:id/lifecycle`. Web: control đổi status trên detail + bắt buộc `lostReason` khi DISQUALIFIED.
**Acceptance:**
- [ ] Chuyển NEW→…→CUSTOMER hợp lệ; DISQUALIFIED bắt buộc `lostReason`; ghi Activity
- [ ] Gate `sales:customer_update`
**Deps:** 1.1
**Verification:** unit chuyển trạng thái + ràng buộc lý do; integration.

### Task 1.4 — SalesCompany (B2B) + tạo nhanh inline
**Objective:** Lớp tổ chức cho B2B (B2C bỏ trống).
**Files:** API: `company.service/repository`, controller, routes. Web: `hooks/useCompanies.ts`, `CompanyFormSheet.tsx`, inline-create trong CustomerFormSheet; trang Company list contact + deal.
**Acceptance:**
- [ ] CRUD Company; tạo nhanh khi tạo Customer B2B; 1 company → nhiều contact
- [ ] Gate dùng `sales:customer_*`
**Deps:** 1.1
**Verification:** integration tạo customer B2B kèm company mới; UI inline.

### Task 1.5 — Import khách → Lead Pool
**Objective:** Nạp danh sách potential customer.
**Files:** API: `customer-import` (parse Excel/CSV, validate, dedupe, ownerId=null); reuse pattern bulk-import có sẵn. Web: `components/CustomerImportWizard.tsx`.
**Acceptance:**
- [ ] Upload Excel/CSV → preview → đổ vào Lead Pool; báo dòng lỗi/trùng
- [ ] Gate `sales:customer_create`
**Deps:** 1.1, 1.2
**Verification:** integration import file mẫu; UI wizard skeleton/empty/error.

---
## ✅ Checkpoint: Quản lý Khách hàng/Lead — CRUD, scope theo owner, Lead Pool + assignment + lifecycle + import. E2E nhỏ: tạo lead → claim → đổi lifecycle, assert owner + activity.
---

## Phase 2 — Pipeline & Cơ hội (Deal)

### Task 2.1 — Pipeline/Stage read + cấu hình tối thiểu
**Objective:** Có stage để Deal chạy; admin sửa được stage.
**Files:** API: `pipeline.service/repository`, controller `/pipelines`, `/pipelines/:id/stages` (reorder). Web: stage editor trong `/settings/sales`, `hooks/usePipelines.ts`.
**Acceptance:**
- [ ] GET pipeline default + stages; admin thêm/sửa/đổi thứ tự stage (không xóa stage có deal)
- [ ] ⚠️ Review#1: `deal_stage_history.to_stage_id` là FK `RESTRICT` → stage **từng được dùng** (có history) không xóa được dù hết deal active. Chỉ cho xóa stage *chưa từng dùng*; còn lại **archive/ẩn** (cân nhắc thêm cờ `archived` cho SalesStage)
- [ ] Gate `sales:settings`
**Deps:** 0.3
**Verification:** unit reorder + chặn xóa stage có deal; UI stage editor.

### Task 2.2 — Deal CRUD + Kanban board + list (owner-scoped)
**Objective:** Tạo & xem cơ hội theo pipeline.
**Files:** API: `deal.service/repository`, controller, validator, routes. Web: `pages/PipelinePage.tsx` (Kanban tái dùng `JobPipelineBoard`/`pipeline-drop.ts`), `DealFormSheet.tsx`, `DealCard.tsx`, list view, `hooks/useDeals.ts`.
**Acceptance:**
- [ ] CRUD Deal (customer, pipeline, stage, owner, expectedCloseDate, currency); Kanban + list
- [ ] Owner-scope server-side (như 1.1); `amount` mặc định 0 (chưa quote)
- [ ] Gate `sales:deal_view|deal_create|deal_update`
**Deps:** 2.1, 1.1
**Verification:** integration tạo/đọc deal theo role; UI Kanban render theo stage, `tabular-nums` cho tiền.

### Task 2.3 — Move stage + DealStageHistory + Activity
**Objective:** Kéo-thả/đổi stage ghi vết.
**Files:** API: `deal.service.move` (transaction: đổi stage + ghi `DealStageHistory` + `SalesActivity` STAGE_CHANGED). Web: drag handler gọi `/deals/:id/move`, optimistic update + rollback.
**Acceptance:**
- [ ] Mọi lần chuyển ghi `DealStageHistory {from,to,by,at,note}` + Activity
- [ ] Gate `sales:deal_move`
**Deps:** 2.2
**Verification:** unit move ghi history; integration; UI optimistic + rollback khi lỗi.

### Task 2.4 — Win/Lose deal (→ Customer lifecycle)
**Objective:** Đóng deal + cập nhật vòng đời khách.
**Files:** API: `deal.service.win/lose` (status, wonAt/lostAt, lostReason; WIN ⇒ Customer.lifecycle=CUSTOMER; +Activity STATUS_CHANGED). Web: nút Win/Lose + dialog lý do.
**Acceptance:**
- [ ] WIN: status=WON, wonAt, Customer→CUSTOMER; LOSE: status=LOST, lostAt + lostReason bắt buộc; ghi Activity
- [ ] Gate `sales:deal_move`
**Deps:** 2.3, 1.3
**Verification:** unit + integration WIN→lifecycle; UI dialog.

---
## ✅ Checkpoint: Pipeline — Deal CRUD, Kanban kéo-thả ghi history, Win/Lose cập nhật lifecycle. E2E: tạo deal → move qua stage → WIN, assert history + Customer=CUSTOMER.
---

## Phase 3 — Sản phẩm & Báo giá (giá trị Deal)

### Task 3.1 — Product catalog CRUD
**Files:** API: `product.service/repository`, controller, routes. Web: `pages/ProductListPage.tsx`, `ProductFormSheet.tsx`, `hooks/useProducts.ts`.
**Acceptance:**
- [ ] CRUD Product (name, SKU unique/tenant, unitPrice, currency, unit, status); archive thay vì xóa nếu đã dùng
- [ ] Gate `sales:product_view|product_manage`
**Deps:** 0.3
**Verification:** unit chặn xóa product đã dùng; UI list/empty.

### Task 3.2 — Quote + QuoteItem + đồng bộ Deal.amount ⭐ (risk)
**Objective:** Báo giá nhiều dòng → tự tính giá trị Deal.
**Files:** API: `quote.service/repository` (tính `lineTotal`, `Quote.total`, sync `Deal.amount` từ quote `isPrimary` **trong cùng transaction** — D4), controller `/deals/:id/quotes` + items. Web: `components/QuoteEditor.tsx` (tab Báo giá trên Deal/Customer), `hooks/useQuotes.ts`.
**Acceptance:**
- [ ] `lineTotal = qty × unitPrice × (1−discount%)`; `Quote.total = Σ`; `Deal.amount = primary quote total`
- [ ] Nhiều version quote; QuoteStatus + validUntil; chỉ 1 primary/deal
- [ ] Gate `sales:quote_view|quote_manage`
**Deps:** 2.2, 3.1
**Verification:** **unit kỹ** phép tính + sync amount (edge: discount, đổi primary, xóa item); integration; UI cập nhật amount realtime.

### Task 3.3 — Quote PDF export
**Files:** API: `domain/sales/quote.pdf.ts` (pattern `po.pdf.ts`), endpoint `/quotes/:id/pdf` gắn `IssuingEntity`. Web: nút tải PDF.
**Acceptance:**
- [ ] PDF báo giá đúng line-item + tổng + thông tin tenant/issuing entity
- [ ] Gate `sales:quote_view`
**Deps:** 3.2
**Verification:** integration sinh PDF (assert có nội dung); tải thử thủ công.

---
## ✅ Checkpoint: Báo giá — Product + Quote line-items, `Deal.amount` chính xác & đồng bộ, PDF xuất được. E2E mở rộng: deal + quote → amount đúng.
---

## Phase 4 — Hoạt động, Việc follow-up, Email

### Task 4.1 — Activity feed (timeline)
**Files:** API: `activity.service/repository`, endpoint `/customers/:id/activities` (đọc theo quyền), tạo NOTE thủ công. Web: `components/ActivityFeed.tsx`, `NoteComposer.tsx`.
**Acceptance:**
- [ ] Feed gộp note thủ công + sự kiện hệ thống (stage/owner/status/lifecycle/email) theo `occurredAt`
- [ ] Thêm NOTE; hiển thị ở tab Hoạt động của Customer & Deal
**Deps:** 1.1, 2.3 (sự kiện đã ghi từ trước)
**Verification:** integration tạo note + đọc feed; UI feed.

### Task 4.2 — SalesTask + "Việc của tôi" + nhắc tự động
**Objective:** Follow customer có hạn + nhắc.
**Files:** API: `task.service/repository`, controller `/tasks`,`/tasks/mine`,`/:id/complete`; cắm `domain/reminders` (enqueue khi tạo/đổi dueAt, notification cho assignee). Web: `pages/MyTasksPage.tsx` (Hôm nay/Quá hạn/Sắp tới), tick complete optimistic, tạo task từ Customer/Deal.
**Acceptance:**
- [ ] CRUD task (type, title, dueAt, assignee, customer, deal?); complete; quá hạn nổi bật
- [ ] Task tới hạn → reminder/notification qua BullMQ
- [ ] Gate `sales:task_view|task_manage`
**Deps:** 1.1
**Verification:** unit gom nhóm theo hạn; integration reminder enqueue (mock queue); UI optimistic.

### Task 4.3 — Email templates CRUD
**Files:** API: `email-template.service/repository`, controller `/email-templates`. Web: settings template list + editor (biến `{{customerName}}`…).
**Acceptance:**
- [ ] CRUD template (name, subject, body, isActive); Gate `sales:template_manage`
**Deps:** 0.3
**Verification:** integration CRUD; UI editor.

### Task 4.4 — Gửi email (Resend async) + lịch sử
**Objective:** Send email cho customer + log.
**Files:** API: `email.service` (render template/biến, enqueue BullMQ → worker gọi `infrastructure/email` Resend, ghi `SalesEmailMessage` + Activity EMAIL), endpoint `/emails`, `/customers/:id/emails`. Web: `components/SendEmailSheet.tsx`, tab Email lịch sử.
**Acceptance:**
- [ ] Gửi (chọn template/soạn tự do) qua Resend **async**; lưu EmailMessage status QUEUED→SENT|FAILED; tạo Activity EMAIL; gửi lại khi FAILED
- [ ] Không log PII; Gate `sales:email_send`
**Deps:** 4.3, 4.1
**Verification:** integration mock Resend (SENT + FAILED path); UI lịch sử + resend.

---
## ✅ Checkpoint: Engagement — Activity feed, follow-up task + nhắc, email + template + lịch sử. E2E: lead → email (Activity EMAIL) → tạo task → complete.
---

## Phase 5 — Dashboard & hoàn thiện

### Task 5.1 — Reports API (overview + forecast) scoped
**Files:** API: `report.service` (overview theo owner; forecast = Σ `amount × probability` deal OPEN; phân bổ lead theo rep; conversion; nguồn lead), endpoints `/reports/overview`,`/reports/forecast`.
**Acceptance:**
- [ ] Số liệu lọc theo owner/team server-side; Gate `sales:report_view` (+`view_all` mở rộng team)
**Deps:** 2.4, 3.2
**Verification:** integration số liệu đúng theo 2 role (seed đủ deal/lead).

### Task 5.2 — Dashboard UI theo role (Recharts)
**Files:** Web: `pages/SalesDashboardPage.tsx` (rẽ nhánh REP vs MANAGER theo permission), stat cards + Recharts.
**Acceptance:**
- [ ] REP: lead NEW chưa liên hệ, việc hôm nay/quá hạn, pipeline của tôi, WON/LOST tháng, conversion
- [ ] MANAGER: phân bổ lead theo rep, pipeline team, forecast, win-rate, nguồn lead
- [ ] `tabular-nums`; insight so kỳ trước cạnh metric; skeleton
**Deps:** 5.1
**Verification:** UI 2 role; preview screenshot light+dark.

### Task 5.3 — Nav, i18n, command palette, RBAC UI, a11y/dark-mode pass
**Files:** Web: `Sidebar.tsx` (group "KINH DOANH": Khách hàng/Pipeline/Việc của tôi/Sản phẩm — gắn permission, ẩn group khi rỗng); `router.tsx` (routes `/sales/*`, `/settings/sales`); `i18n/locales/{vi,en}/sales.json`; `CommandPalette.tsx` (hành động "Thêm khách hàng", "Tạo deal"); rà `<Can>`/usePermission mọi nút.
**Acceptance:**
- [ ] Sidebar group + routes + i18n vi/en đầy đủ; palette actions; RBAC ẩn/hiện đúng
- [ ] WCAG AA, dark mode, design token (no hex), responsive 768–1440; status badge màu+chữ
**Deps:** 1.1–5.2
**Verification:** preview snapshot + screenshot; toggle vi/en + dark; tab navigation.

---
## ✅ Checkpoint: Feature complete — chạy `/test` (E2E critical path đầy đủ theo spec) rồi `/review` (five-axis) trước khi ship.
---

## Thứ tự & rủi ro

- **Risk-first**: owner-scope (1.1) và **Deal.amount↔Quote sync (3.2)** là 2 chỗ dễ sai nhất → unit test kỹ.
- **Foundation → vertical**: Phase 0 là nền duy nhất mang tính "horizontal" (không tránh được cho schema/RBAC).
- **Dữ liệu không dựng lại được**: `DealStageHistory` (2.3) + Activity ghi **ngay từ đầu**.
- Mỗi task: TDD (RED→GREEN→REFACTOR), tenant-scoped, RBAC server-side, transaction cho đổi trạng thái/tiền.

## Ngoài phạm vi (Tier 2 — không làm trong plan này)
Email tracking/sequence · round-robin tự động · lead scoring · invoice/hợp đồng · form web thu lead ·
tích hợp calendar/VoIP · multi-pipeline UI · báo cáo nâng cao (cohort/leaderboard).
