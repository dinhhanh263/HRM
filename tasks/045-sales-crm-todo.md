# TODO — SPEC-045 Sales / CRM

> Plan đầy đủ: [045-sales-crm-plan.md](045-sales-crm-plan.md) · Spec: [docs/specs/045-sales-crm.md](../docs/specs/045-sales-crm.md)
> Mỗi task = vertical slice (DB→API→UI), TDD, tenant-scoped, RBAC server-side.

## Phase 0 — Foundation
- [x] 0.1 — Prisma schema + migration (`20260629082606_add_sales_crm`; typecheck pass)
- [x] 0.2 — RBAC catalog `sales:*` (19 keys, single-colon) + role `SALES_REP`/`SALES_MANAGER` (seeder riêng, isSystem; **D2 revised** — không đụng UserRole enum) + hr_manager grants
- [x] 0.3 — Scaffold domain + mount `/api/v1/sales` (`GET /pipelines`) + `seedDefaultSalesPipelineForTenant`

### ✅ Checkpoint: Foundation — migrate + seed + router verified (401 no-token, happy-path trả default pipeline 6 stage)

## Phase 1 — Khách hàng / Lead / Ownership
- [x] 1.1 — Customer CRUD + owner-scoped list + dedupe
      - [x] **API**: normalize(phone E.164)+scope (8 unit) · repo · service (dedupe email/phone→409) · validator · controller (`view_all`) · 4 route gated · **6 integration test pass**
      - [x] **Web UI**: shared types · hooks · CustomerListPage (search/filter/pagination/skeleton/empty) · CustomerFormSheet (create/edit + dedupe warning) · CustomerDetailPage (tabs) · LifecycleBadge · sidebar group KINH DOANH · i18n vi/en · breadcrumb
      - [x] **Verified browser**: list/create/dedupe/detail · phone→E.164 · light+dark · breadcrumb · 0 console error
- [x] 1.2 — Lead Pool + claim/assign/reassign/bulk + Activity OWNER_CHANGED
      - [x] **API**: changeOwner (tx + OWNER_CHANGED) · claim · assign · bulk-assign · owners endpoint · validators · routes gated · **6 integration test pass**
      - [x] **Web UI**: hooks · AssignOwnerDialog (owner picker) · row actions Nhận/Phân công · checkbox selection + bulk bar (glass)
      - [x] **Verified browser**: bulk-assign→pool (activity "Super Admin → Lead Pool") · claim→owner lại · menu điều kiện · 0 console error
      - ℹ️ Review#2 (reassign cả Deal/Task) hoãn tới Phase 2/4 khi 2 entity đó tồn tại
- [x] 1.3 — Đổi lifecycle status (+ lostReason khi DISQUALIFIED)
      - [x] **API**: changeLifecycle (tx + LIFECYCLE_CHANGED) · validate middleware (DISQUALIFIED bắt buộc lostReason → 422) · route gated · **4 integration test pass**
      - [x] **Web UI**: useChangeLifecycle · LifecycleMenu (dropdown 6 trạng thái + dialog lý do) · hiển thị lostReason ở detail · shared type
      - [x] **Verified browser**: NEW→CONTACTED→DISQUALIFIED · dialog lý do bắt buộc · activity ["NEW → CONTACTED","CONTACTED → DISQUALIFIED"] · lostReason hiển thị · 0 console error
- [x] 1.4 — SalesCompany (B2B) + tạo nhanh inline
      - [x] **API**: company repo/service/validator/controller + 4 route gated · customer link guard (cross-tenant 400) · **3 integration test pass**
      - [x] **Web UI**: useCompanies · CompanyPicker (combobox + tạo inline) trong form B2B · CompanyListPage + CompanyFormSheet · sidebar item Công ty · i18n · route/breadcrumb
      - [x] **Verified browser**: tạo công ty FPT Software · CompanyPicker render khi B2B · 0 console error
- [x] 1.5 — Import khách → Lead Pool (Excel/CSV)
      - [x] **API**: ExcelJS parser (header-based) · service dry-run+commit · dedupe trong-file+DB · template download · multipart route gated · **4 integration test pass**
      - [x] **Web UI**: useImportCustomers + downloadImportTemplate · CustomerImportWizard (upload→preview→commit) · nút "Nhập file" toolbar · i18n
      - [x] **Verified browser**: wizard render (template + dropzone), logic tested

### ✅ Checkpoint: Customer/Lead — **31/31 test sales pass** (normalize 8 · customer 6 · assignment 6 · lifecycle 4 · company 3 · import 4); typecheck API+Web sạch

## Phase 2 — Pipeline & Deal
- [x] 2.1 — Pipeline/Stage read + cấu hình (settings)
      - [x] API: stage create/update/delete(guard RESTRICT review#1→409 STAGE_IN_USE)/reorder gated sales:settings
      - [x] Web: SalesSettingsPage (add/edit/delete/up-down reorder) + route /settings/sales + sidebar + i18n
- [x] 2.2 — Deal CRUD + Kanban + list (owner-scoped)
      - [x] API: deal repo/service/validator/controller + routes; owner-scope (no Lead Pool)
      - [x] Web: PipelinePage (dnd-kit board) + DealFormSheet + DealCard + sidebar Pipeline; verified render+create ("0 ₫")
- [x] 2.3 — Move stage + DealStageHistory + Activity STAGE_CHANGED (tx)
- [x] 2.4 — Win/Lose deal → Customer lifecycle CUSTOMER (WON→CUSTOMER, LOST+lostReason); drag→WON=win, →LOST=lose dialog

### ✅ Checkpoint: Pipeline — **deal suite 6/6** (create·move+history·win→CUSTOMER·lose 422·owner-scope·stage in-use); 37 sales API tests pass. ⚠️ dnd drag không test được headless (logic move/win/lose đã phủ API)

## Phase 3 — Sản phẩm & Báo giá
- [x] 3.1 — Product catalog CRUD (archive thay xóa; delete chặn PRODUCT_IN_USE 409)
      - API product repo/service/validator/controller/routes; Web ProductListPage + ProductFormSheet + sidebar Sản phẩm
- [x] 3.2 — ⭐ Quote + QuoteItem + đồng bộ Deal.amount (transaction)
      - quote-calc (6 unit) · quote.service (tx: lineTotal/total/sync primary→Deal.amount) · 6 integration test
      - Web QuoteFormSheet (line-items live total) + QuoteEditor trong DealDetailSheet (mở từ Kanban card)
      - **Verified e2e browser**: tạo báo giá 3×2tr → BG001 primary 6.000.000₫ → card Kanban Deal.amount = 6.000.000₫
- [x] 3.3 — Quote PDF export (PDFKit + Be Vietnam Pro, IssuingEntity); nút Tải PDF trong DealDetailSheet

### ✅ Checkpoint: Báo giá — **49 sales API tests pass** (9 files); Deal.amount sync verified e2e; PDF tested

## Phase 4 — Activity / Task / Email
- [x] 4.1 — Activity feed (timeline note + sự kiện hệ thống) — API + ActivityFeed trên tab Hoạt động; verified note
- [x] 4.2 — SalesTask + "Việc của tôi" + nhắc tự động (BullMQ delayed `sales-task-reminder` → notification)
      - API task service/worker + register; Web MyTasksPage (Quá hạn/Hôm nay/Sắp tới) + CustomerTaskTab + sidebar
- [x] 4.3 — Email templates CRUD (EmailTemplatesSection trong /settings/sales)
- [x] 4.4 — Gửi email (Resend async via `sales-email` worker) + lịch sử + Activity EMAIL (render {{vars}})
      - **5 integration test** (note+feed · task+reminder notification · complete · email→SENT+activity · no-email 400)
      - **Verified browser**: note · gửi email (lịch sử) · thêm task · MyTasksPage nhóm SẮP TỚI

### ✅ Checkpoint: Engagement — **54 sales API tests pass** (10 files); reminder qua BullMQ verified

## Phase 5 — Dashboard & hoàn thiện
- [x] 5.1 — Reports API (overview + forecast + by-owner) owner-scoped — **4 integration test** (overview·forecast weighting·scope·view_all 403)
- [x] 5.2 — Dashboard UI theo role (Recharts: pipeline/sources/by-owner; stat cards) — verified e2e: PIPELINE 6.0tr, DỰ BÁO 600.000 (6tr×10%)
- [x] 5.3 — Sidebar group KINH DOANH (6 items) + i18n vi/en đầy đủ + command palette (5 sales actions) + breadcrumbs + RBAC gating + dark-mode verified

### ✅ Checkpoint: Feature complete — **58 sales API tests** (11 files); **toàn bộ 1542 API test pass** (0 hồi quy); web build OK; light+dark verified
