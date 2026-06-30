# SPEC-045: Sales / CRM — Quản lý bán hàng (B2B + B2C)

**Status:** Draft (chờ duyệt)
**Created:** 2026-06-29
**Author:** Claude + Hạnh
**Depends on:** SPEC-001 (Auth), SPEC-002 (Employee), SPEC-003 (Authorization/RBAC),
SPEC-024 (Recruitment — tái dùng pattern pipeline Kanban), SPEC-017 (reminders), SPEC-036 (Tenant settings)

---

## Objective

Xây dựng module **Sales / CRM** cho hệ thống HRM: quản lý **khách hàng tiềm năng (lead) →
khách hàng**, theo dõi **cơ hội bán hàng (Deal)** qua một **pipeline cấu hình được** (Kanban),
quản lý **Sản phẩm + Báo giá nhiều dòng**, ghi nhận mọi **hoạt động chăm sóc (Activity)** và
**việc follow-up có nhắc tự động**, **gửi email** cho khách (qua Resend) kèm **template** và
**lịch sử**, và **dashboard báo cáo theo role**. Hỗ trợ **cả B2B lẫn B2C** trên một mô hình
thống nhất. Thiết kế theo chuẩn CRM chuyên nghiệp (HubSpot/Pipedrive/Salesforce) nhưng tinh
gọn cho SMB Việt Nam.

## Nguyên tắc kiến trúc cốt lõi (quyết định nền tảng)

> **1. Tách "Khách hàng" (Customer) khỏi "Cơ hội" (Deal) — hai trục độc lập.**
> - **Customer** = một *con người hoặc tổ chức* (tồn tại lâu dài, chống trùng, có vòng đời lead).
> - **Deal** = *một thương vụ cụ thể* của một Customer (mang giá trị tiền, stage pipeline, kết quả).
> - Quan hệ: 1 Customer → nhiều Deal. Một Customer đã `QUALIFIED` có thể chạy nhiều Deal song song.
>
> Đây là điểm mọi CRM nghiêm túc đều làm và **rất đau nếu retrofit sau**.

> **2. Hai loại "trạng thái" KHÁC NHAU, không gộp:**
> - **`Customer.lifecycleStatus`** — *"Người/đơn vị này có đáng theo đuổi không?"*
>   `NEW → CONTACTED → QUALIFIED → CONVERTED → CUSTOMER` (hoặc nhánh `DISQUALIFIED`).
> - **`Deal.stage`** (trên pipeline) — *"Một thương vụ cụ thể đang đi tới đâu?"*
>   Mới → Báo giá → Đàm phán → Thắng/Thua. Có `status` cố định `OPEN | WON | LOST`.

> **3. Ownership là bắt buộc.** Mỗi Customer và mỗi Deal có **1 owner (Saler phụ trách)**.
> `ownerId = null` ⇒ nằm trong **Lead Pool** (chưa ai nhận). Mọi thay đổi owner ghi vào Activity.
> Visibility theo owner: `SALES_REP` thấy của mình; `SALES_MANAGER` thấy toàn team (`sales:view_all`).

> **4. Mô hình thống nhất B2B + B2C.** Dùng một entity `Customer` có `type: B2B | B2C`.
> Lớp `SalesCompany` (tổ chức) là **optional** — chỉ B2B mới gắn `companyId`.

> **5. Build `DealStageHistory` ngay từ MVP** dù màn báo cáo nâng cao làm sau — dữ liệu
> velocity/conversion không thể dựng lại sau (bài học SPEC-024).

## Quyết định discovery (đã chốt 2026-06-29)

1. **Trọng tâm = cả B2B lẫn B2C** → Customer thống nhất + `SalesCompany` optional.
2. **Có Sản phẩm & Báo giá ngay từ MVP** → `Product` catalog + `Quote`/`QuoteItem`;
   **giá trị Deal tính tự động** từ tổng line-item của báo giá chính (không nhập tay).
3. **Phạm vi Giai đoạn 1 = đầy đủ**: Khách hàng · Pipeline Kanban · Sản phẩm/Báo giá ·
   Activity + Follow-up task có nhắc · Email + **template** + lịch sử · **Dashboard theo role**.
4. **Full-stack mới**: Prisma schema + REST API (Express) + React UI theo tech stack CLAUDE.md.
5. **Tái dùng hạ tầng sẵn có**: pipeline Kanban kéo-thả (SPEC-024/`JobPipelineBoard`),
   email Resend (`infrastructure/email`), nhắc việc BullMQ (`domain/reminders`), RBAC catalog.
6. **Email gửi đi qua Resend**; tracking mở/click là **Tier 2** (chừa sẵn field `EmailStatus`).
7. **Phân công lead**: MVP làm **Manual + Claim từ Lead Pool**; **Round-robin** cấu hình ở
   tenant settings (bật sau, chừa sẵn `assignmentMethod`).

## Target Users

| User | Vai trò Sales | Actions chính |
|------|---------------|---------------|
| **Super Admin / HR (admin)** | Quản trị CRM | Cấu hình pipeline/sản phẩm/template, xem toàn bộ, gán lead |
| **SALES_MANAGER** | Trưởng nhóm KD | Xem & phân bổ lead toàn team, theo dõi pipeline + báo cáo team, reassign |
| **SALES_REP** | Nhân viên KD | Quản lý lead/khách **của mình**, đẩy deal, tạo báo giá, gửi email, follow-up |

> Visibility gắn theo **owner**: rep chỉ thấy bản ghi mình sở hữu + Lead Pool chưa ai nhận;
> manager/admin thấy toàn tenant qua `sales:view_all`.

---

## Core Features

### 1. Khách hàng & Lead (Customer) — vòng đời + chống trùng
**Acceptance Criteria:**
- [ ] CRUD Customer: `type` (`B2B|B2C`), họ tên (B2C) / tên liên hệ (B2B), email, SĐT (chuẩn hóa E.164),
      chức danh, địa chỉ, `source` (nguồn lead), ghi chú; B2B gắn `companyId` (tạo nhanh Company inline)
- [ ] **`lifecycleStatus`**: `NEW | CONTACTED | QUALIFIED | CONVERTED | CUSTOMER | DISQUALIFIED`
      — đổi status ghi vào Activity; vào `DISQUALIFIED` bắt buộc `lostReason`
- [ ] **`source`** enum: `WEB | REFERRAL | COLD_CALL | COLD_EMAIL | EVENT | SOCIAL | ADVERTISING | PARTNER | IMPORT | OTHER`
- [ ] **Chống trùng** theo email (chính) → SĐT chuẩn hóa → fuzzy tên + (B2B) tên công ty;
      nhập trùng → cảnh báo + đề xuất merge, không tạo người trùng âm thầm
- [ ] Danh sách: search (bỏ dấu/hoa-thường), filter (`type`, `lifecycleStatus`, `source`, owner, company),
      sort, pagination server-side; **import** khách từ file (Excel/CSV) → đổ vào Lead Pool
- [ ] Trang chi tiết: thông tin + tabs **Hoạt động · Cơ hội (Deal) · Báo giá · Email · Việc cần làm**
- [ ] Gate `sales:customer_view|customer_create|customer_update`

### 2. Ownership & phân công lead (assignment)
**Acceptance Criteria:**
- [ ] `Customer.ownerId` nullable; `ownerId = null` ⇒ **Lead Pool**. `assignedAt` ghi thời điểm gán
- [ ] **Claim**: rep nhận lead từ Lead Pool về mình; **Assign/Reassign**: manager/admin gán hoặc
      chuyển lead giữa các rep → ghi Activity `OWNER_CHANGED` (`{from, to, by, at}`)
- [ ] Gán hàng loạt (bulk assign) từ danh sách Lead Pool
- [ ] `assignmentMethod` ở tenant settings: `MANUAL` (mặc định) · `ROUND_ROBIN` (chừa sẵn, bật sau)
- [ ] Visibility server-side theo owner; gate `sales:customer_assign` cho hành động gán người khác

### 3. Công ty / Account (B2B, optional)
**Acceptance Criteria:**
- [ ] CRUD `SalesCompany`: tên, mã số thuế, ngành, quy mô, website, địa chỉ; **B2C bỏ trống hoàn toàn**
- [ ] 1 Company → nhiều Customer (người liên hệ); trang Company hiện danh sách contact + deal liên quan
- [ ] Tạo nhanh Company khi tạo Customer B2B (không bắt rời màn)
- [ ] Gate dùng chung `sales:customer_*`

### 4. Pipeline cấu hình được + Cơ hội (Deal)
**Acceptance Criteria:**
- [ ] `SalesPipeline` cấp tenant (cho phép **nhiều pipeline**, vd "B2B", "B2C"); mỗi pipeline có các `SalesStage`
- [ ] Mỗi `SalesStage`: `name`, `order`, `type` (`NEW|QUALIFYING|PROPOSAL|NEGOTIATION|WON|LOST`),
      `probability` (% mặc định để forecast) — `type` để analytics chuẩn hóa dù tên tùy biến
- [ ] Seed mặc định 1 pipeline VN-friendly khi tenant lần đầu truy cập (giống auto-seed payroll/timesheet)
- [ ] CRUD Deal: tên, `customerId`, `pipelineId`, `currentStageId`, `ownerId`, `expectedCloseDate`,
      `currency`, `amount` (xem Feature 6), `status` (`OPEN|WON|LOST`)
- [ ] **Kanban kéo-thả** Deal theo stage trong 1 pipeline + chế độ danh sách; nút "Chuyển stage"
- [ ] **`DealStageHistory`** ghi mọi lần chuyển stage `{fromStageId, toStageId, changedById, changedAt, note}` ⭐
- [ ] WON → `status=WON`, `wonAt`, đẩy Customer.lifecycle → `CUSTOMER`; LOST → `status=LOST`, `lostAt` + `lostReason`
- [ ] Gate `sales:deal_view|deal_create|deal_update|deal_move`

### 5. Sản phẩm (Product catalog)
**Acceptance Criteria:**
- [ ] CRUD Product: tên, SKU (unique/tenant), mô tả, đơn giá mặc định, `currency`, đơn vị tính, `status` (`ACTIVE|ARCHIVED`)
- [ ] Danh sách: search, filter status; archive thay vì xóa nếu đã dùng trong báo giá
- [ ] Gate `sales:product_view` / `sales:product_manage`

### 6. Báo giá nhiều dòng (Quote) → giá trị Deal ⭐
**Acceptance Criteria:**
- [ ] `Quote` thuộc 1 Deal (cho phép **nhiều version**); `QuoteItem` tham chiếu `Product` với
      `quantity`, `unitPrice` (mặc định lấy từ Product, sửa được), `discountPct`, `lineTotal` (tính ra)
- [ ] **Tổng báo giá** = Σ lineTotal (− chiết khấu); **`Deal.amount` = tổng của báo giá chính** (primary),
      tự đồng bộ khi item đổi — **không nhập tay**. Deal chưa có báo giá ⇒ `amount = 0`
- [ ] `QuoteStatus`: `DRAFT | SENT | ACCEPTED | REJECTED | EXPIRED`; `validUntil` (hạn báo giá)
- [ ] Xuất **PDF báo giá** (tái dùng pattern PDF của Payslip/PO) gắn thông tin tenant/`IssuingEntity`
- [ ] Gate `sales:quote_view` / `sales:quote_manage`

### 7. Hoạt động & Việc follow-up (Activity + Task)
**Acceptance Criteria:**
- [ ] **`Activity`** (timeline) gắn `customerId` (bắt buộc) + `dealId` (optional): `type`
      (`CALL|EMAIL|MEETING|NOTE` + sự kiện hệ thống `STAGE_CHANGED|OWNER_CHANGED|STATUS_CHANGED`),
      `body`, `authorId` (null = hệ thống), `occurredAt` — hiển thị dạng feed trên chi tiết Customer/Deal
- [ ] **`SalesTask`** (follow-up): `type` (`CALL|EMAIL|MEETING|TODO`), `title`, `dueAt`, `assigneeId`,
      `customerId` (+ `dealId` optional), `status` (`OPEN|DONE|CANCELLED`)
- [ ] **Nhắc tự động** qua BullMQ (`domain/reminders`): task tới hạn → notification cho assignee;
      task quá hạn nổi bật đỏ ở màn "Việc của tôi"
- [ ] Màn **"Việc của tôi"**: nhóm Hôm nay / Quá hạn / Sắp tới; tick hoàn thành (optimistic update)
- [ ] Gate `sales:task_view|task_manage` (activity đọc theo quyền của Customer/Deal)

### 8. Email cho khách — gửi + template + lịch sử
**Acceptance Criteria:**
- [ ] **`EmailTemplate`** cấp tenant: tên, subject, body (hỗ trợ biến `{{customerName}}`, `{{ownerName}}`…), `isActive`
- [ ] Soạn & gửi email tới Customer (chọn template hoặc soạn tự do) **qua Resend** (`infrastructure/email`)
- [ ] **`EmailMessage`** lưu lịch sử: `to`, `subject`, `body`, `status` (`QUEUED|SENT|FAILED`),
      `sentById`, `sentAt`, `customerId`, `dealId?`, `templateId?` — hiển thị ở tab Email của Customer
- [ ] Gửi email tạo luôn 1 `Activity` type `EMAIL` trên timeline
- [ ] Gửi async qua BullMQ (không block request); lỗi gửi → `status=FAILED`, cho gửi lại
- [ ] Tracking mở/click = **Tier 2** (chừa enum `OPENED|CLICKED`); Gate `sales:email_send`, `sales:template_manage`

### 9. Dashboard báo cáo theo role
**Acceptance Criteria:**
- [ ] **SALES_REP**: lead `NEW` chưa liên hệ của tôi · việc follow-up hôm nay/quá hạn · pipeline của tôi
      (Σ giá trị deal OPEN theo stage) · deal WON/LOST tháng này · tỷ lệ chuyển đổi của tôi
- [ ] **SALES_MANAGER/admin**: phân bổ lead theo rep · tổng pipeline team theo stage · **forecast**
      (Σ `amount × probability` của deal OPEN) · tỷ lệ WIN team · nguồn lead hiệu quả (theo `source`)
- [ ] Biểu đồ bằng **Recharts**; số liệu `tabular-nums`; insight so kỳ trước đặt cạnh metric
- [ ] Gate `sales:report_view`; dữ liệu lọc theo owner/team server-side

### 10. RBAC & cấu hình
**Acceptance Criteria:**
- [ ] **RBAC end-to-end server-side** (`requirePermission`) + lọc theo `owner`; UI ẩn nút chỉ là UX
- [ ] 2 role nghiệp vụ mới: `SALES_REP`, `SALES_MANAGER` (seed quyền mặc định — xem Permissions)
- [ ] Trang `/settings/sales`: cấu hình pipeline/stages, sản phẩm, email template, `assignmentMethod`
- [ ] Mọi entity **tenant-scoped** tuyệt đối; gate `sales:settings`

---

## Data Model (Prisma — bổ sung mới)

```prisma
// ===== Enums =====
enum CustomerType        { B2B B2C }
enum CustomerLifecycle   { NEW CONTACTED QUALIFIED CONVERTED CUSTOMER DISQUALIFIED }
enum LeadSource          { WEB REFERRAL COLD_CALL COLD_EMAIL EVENT SOCIAL ADVERTISING PARTNER IMPORT OTHER }
enum SalesStageType      { NEW QUALIFYING PROPOSAL NEGOTIATION WON LOST }
enum DealStatus          { OPEN WON LOST }
enum ProductStatus       { ACTIVE ARCHIVED }
enum QuoteStatus         { DRAFT SENT ACCEPTED REJECTED EXPIRED }
enum SalesActivityType   { CALL EMAIL MEETING NOTE STAGE_CHANGED OWNER_CHANGED STATUS_CHANGED LIFECYCLE_CHANGED }
enum SalesTaskType       { CALL EMAIL MEETING TODO }
enum SalesTaskStatus     { OPEN DONE CANCELLED }
enum SalesEmailStatus    { QUEUED SENT FAILED OPENED CLICKED }   // OPENED/CLICKED = Tier 2
enum AssignmentMethod    { MANUAL ROUND_ROBIN }

// ===== Company (B2B, optional) =====
model SalesCompany {
  id         String   @id @default(cuid())
  tenantId   String   @map("tenant_id")
  name       String
  taxCode    String?  @map("tax_code")
  industry   String?
  size       String?
  website    String?
  address    String?
  customers  Customer[]
  // tenant relation, @@index([tenantId]), @@map("sales_companies")
}

// ===== Customer (người/tổ chức — vòng đời lead, ownership, chống trùng) =====
model Customer {
  id              String            @id @default(cuid())
  tenantId        String            @map("tenant_id")
  type            CustomerType      @default(B2C)
  companyId       String?           @map("company_id")        // chỉ B2B
  fullName        String            @map("full_name")          // tên người / tên liên hệ
  title           String?                                       // chức danh (B2B)
  email           String?
  phone           String?                                       // chuẩn hóa E.164 để dedupe
  address         String?
  source          LeadSource        @default(OTHER)
  lifecycleStatus CustomerLifecycle @default(NEW) @map("lifecycle_status")
  lostReason      String?           @map("lost_reason")         // khi DISQUALIFIED
  ownerId         String?           @map("owner_id")            // Employee; null = Lead Pool
  assignedAt      DateTime?         @map("assigned_at")
  notes           String?
  deals           Deal[]
  activities      SalesActivity[]
  tasks           SalesTask[]
  emails          SalesEmailMessage[]
  // @@index([tenantId, lifecycleStatus]), @@index([tenantId, ownerId])
  // dedupe (email→phone→fuzzy) enforce ở service, @@map("customers")
}

// ===== Pipeline (cấp tenant, nhiều pipeline) =====
model SalesPipeline {
  id        String       @id @default(cuid())
  tenantId  String       @map("tenant_id")
  name      String
  isDefault Boolean      @default(false) @map("is_default")
  stages    SalesStage[]
  deals     Deal[]
  // @@unique([tenantId, name]), @@map("sales_pipelines")
}
model SalesStage {
  id          String         @id @default(cuid())
  pipelineId  String         @map("pipeline_id")
  name        String
  order       Int
  type        SalesStageType
  probability Int            @default(0)   // % cho forecast
  deals       Deal[]
  fromHistory DealStageHistory[] @relation("FromStage")
  toHistory   DealStageHistory[] @relation("ToStage")
  // @@unique([pipelineId, order]), @@map("sales_stages")
}

// ===== Deal (cơ hội bán hàng) =====
model Deal {
  id                String     @id @default(cuid())
  tenantId          String     @map("tenant_id")
  customerId        String     @map("customer_id")
  pipelineId        String     @map("pipeline_id")
  currentStageId    String     @map("current_stage_id")
  ownerId           String     @map("owner_id")            // Employee
  title             String
  amount            Decimal    @default(0) @db.Decimal(18,2) // = tổng báo giá chính (đồng bộ ở service)
  currency          String     @default("VND")
  status            DealStatus @default(OPEN)
  expectedCloseDate DateTime?  @map("expected_close_date")
  wonAt             DateTime?  @map("won_at")
  lostAt            DateTime?  @map("lost_at")
  lostReason        String?    @map("lost_reason")
  stageHistory      DealStageHistory[]
  quotes            Quote[]
  activities        SalesActivity[]
  tasks             SalesTask[]
  // @@index([tenantId, pipelineId, currentStageId]), @@index([tenantId, ownerId])
  // @@map("deals")
}

// ⭐ Lịch sử chuyển stage — nền tảng analytics velocity/conversion (build NGAY)
model DealStageHistory {
  id          String   @id @default(cuid())
  dealId      String   @map("deal_id")
  fromStageId String?  @map("from_stage_id")
  toStageId   String   @map("to_stage_id")
  changedById String   @map("changed_by_id")
  note        String?
  changedAt   DateTime @default(now()) @map("changed_at")
  // @@index([dealId]), @@map("deal_stage_history")
}

// ===== Product + Quote =====
model Product {
  id           String        @id @default(cuid())
  tenantId     String        @map("tenant_id")
  name         String
  sku          String?
  description  String?
  unitPrice    Decimal       @default(0) @db.Decimal(18,2) @map("unit_price")
  currency     String        @default("VND")
  unit         String?       // đơn vị tính
  status       ProductStatus @default(ACTIVE)
  quoteItems   QuoteItem[]
  // @@unique([tenantId, sku]), @@map("products")
}
model Quote {
  id         String      @id @default(cuid())
  tenantId   String      @map("tenant_id")
  dealId     String      @map("deal_id")
  code       String                                   // mã báo giá auto
  status     QuoteStatus @default(DRAFT)
  isPrimary  Boolean     @default(true) @map("is_primary") // báo giá chính → Deal.amount
  validUntil DateTime?   @map("valid_until")
  total      Decimal     @default(0) @db.Decimal(18,2)  // = Σ items (đồng bộ ở service)
  items      QuoteItem[]
  // @@index([dealId]), @@map("quotes")
}
model QuoteItem {
  id          String  @id @default(cuid())
  quoteId     String  @map("quote_id")
  productId   String? @map("product_id")     // null = dòng tự do
  description String?
  quantity    Decimal @default(1) @db.Decimal(18,2)
  unitPrice   Decimal @default(0) @db.Decimal(18,2) @map("unit_price")
  discountPct Decimal @default(0) @db.Decimal(5,2)  @map("discount_pct")
  lineTotal   Decimal @default(0) @db.Decimal(18,2) @map("line_total") // tính ra
  // @@index([quoteId]), @@map("quote_items")
}

// ===== Activity + Task =====
model SalesActivity {
  id          String            @id @default(cuid())
  tenantId    String            @map("tenant_id")
  customerId  String            @map("customer_id")
  dealId      String?           @map("deal_id")
  authorId    String?           @map("author_id")   // null = hệ thống
  type        SalesActivityType
  body        String?
  occurredAt  DateTime          @default(now()) @map("occurred_at")
  // @@index([customerId]), @@index([dealId]), @@map("sales_activities")
}
model SalesTask {
  id          String          @id @default(cuid())
  tenantId    String          @map("tenant_id")
  customerId  String          @map("customer_id")
  dealId      String?         @map("deal_id")
  assigneeId  String          @map("assignee_id")  // Employee
  type        SalesTaskType   @default(TODO)
  title       String
  dueAt       DateTime        @map("due_at")
  status      SalesTaskStatus @default(OPEN)
  completedAt DateTime?       @map("completed_at")
  // @@index([tenantId, assigneeId, status]), @@index([dueAt]), @@map("sales_tasks")
}

// ===== Email =====
model SalesEmailTemplate {
  id        String  @id @default(cuid())
  tenantId  String  @map("tenant_id")
  name      String
  subject   String
  body      String
  isActive  Boolean @default(true) @map("is_active")
  // @@unique([tenantId, name]), @@map("sales_email_templates")
}
model SalesEmailMessage {
  id         String           @id @default(cuid())
  tenantId   String           @map("tenant_id")
  customerId String           @map("customer_id")
  dealId     String?          @map("deal_id")
  templateId String?          @map("template_id")
  to         String
  subject    String
  body       String
  status     SalesEmailStatus @default(QUEUED)
  sentById   String           @map("sent_by_id")
  sentAt     DateTime?        @map("sent_at")
  // @@index([customerId]), @@map("sales_email_messages")
}
```

> Bổ sung back-relations vào `Tenant` (mọi bảng), `Employee` (owner/assignee/author/sentBy),
> và `IssuingEntity` (cho PDF báo giá). `assignmentMethod` lưu ở cấu hình tenant (Settings Center).

## API (dưới `/api/v1/sales`)

| Method | Path | Permission |
|--------|------|-----------|
| GET/POST | `/customers` · `/customers/:id` (GET/PATCH) | `sales:customer_view|customer_create|customer_update` |
| POST | `/customers/import` | `sales:customer_create` |
| POST | `/customers/:id/claim` | `sales:customer_update` |
| POST | `/customers/:id/assign` · `/customers/bulk-assign` | `sales:customer_assign` |
| POST | `/customers/:id/lifecycle` (đổi status) | `sales:customer_update` |
| GET/POST | `/companies` (+ `/:id`) | `sales:customer_*` |
| GET/POST | `/pipelines` · `/pipelines/:id/stages` (reorder) | `sales:settings` |
| GET/POST | `/deals` · `/deals/:id` (GET/PATCH) | `sales:deal_view|deal_create|deal_update` |
| POST | `/deals/:id/move` (đổi stage) · `/win` · `/lose` | `sales:deal_move` |
| GET/POST/PATCH | `/products` (+ `/:id`) | `sales:product_view|product_manage` |
| GET/POST/PATCH | `/deals/:id/quotes` (+ `/quotes/:id`, items) | `sales:quote_view|quote_manage` |
| GET | `/quotes/:id/pdf` | `sales:quote_view` |
| GET/POST | `/customers/:id/activities` | theo quyền Customer |
| GET/POST/PATCH | `/tasks` (+ `/:id`, `/:id/complete`) · `/tasks/mine` | `sales:task_view|task_manage` |
| GET/POST | `/email-templates` (+ `/:id`) | `sales:template_manage` |
| POST | `/emails` (gửi) · GET `/customers/:id/emails` | `sales:email_send` |
| GET | `/reports/overview` · `/reports/forecast` | `sales:report_view` |

- List endpoints: tenant-scoped + lọc theo **owner** khi không có `sales:view_all`.
- Response/pagination theo `api-conventions.md`; tiền tệ trả raw + format ở client.

## Đồng bộ giá trị (quy tắc nghiệp vụ then chốt)

```
QuoteItem đổi (qty/price/discount) ──► lineTotal = qty × unitPrice × (1 − discountPct/100)
                                   └─► Quote.total = Σ lineTotal
Quote.isPrimary = true & đổi total ──► Deal.amount = Quote.total (trong cùng transaction)
Deal.move(stage) ───────────────────► ghi DealStageHistory + Activity STAGE_CHANGED
Deal.win ───────────────────────────► status=WON, wonAt; Customer.lifecycle → CUSTOMER (+Activity)
Deal.lose ──────────────────────────► status=LOST, lostAt + lostReason (+Activity)
owner đổi ──────────────────────────► assignedAt; Activity OWNER_CHANGED {from,to,by}
SalesTask tạo/đổi dueAt ─────────────► enqueue/cập nhật reminder (BullMQ domain/reminders)
Email gửi ──────────────────────────► Resend async; tạo Activity EMAIL; status SENT|FAILED
```

## Permissions (thêm mới — seed vào RBAC)

```
sales:customer_view | sales:customer_create | sales:customer_update | sales:customer_assign
sales:deal_view     | sales:deal_create     | sales:deal_update      | sales:deal_move
sales:product_view  | sales:product_manage
sales:quote_view    | sales:quote_manage
sales:task_view     | sales:task_manage
sales:email_send    | sales:template_manage
sales:report_view   | sales:view_all        | sales:settings
```

Gán mặc định:
- `SUPER_ADMIN` / `HR_MANAGER (admin)`: **all sales:\*** + `sales:view_all` + `sales:settings`
- `SALES_MANAGER`: tất cả trừ `sales:settings` (tùy chọn), **có `sales:view_all`** + `sales:report_view` + `customer_assign`
- `SALES_REP`: `customer_view|create|update`, `deal_view|create|update|move`, `product_view`,
  `quote_view|manage`, `task_view|manage`, `email_send`, `report_view` — **KHÔNG `view_all`/`settings`** (chỉ thấy của mình + Lead Pool)
- `MANAGER`/`EMPLOYEE` mặc định: không có quyền sales (trừ khi gán role sales)

## UI / Routes

| Route | Màn hình | Pattern tái dùng |
|---|---|---|
| `/sales` | Dashboard sales (KPI theo role) | Stat cards + Recharts |
| `/sales/customers` | Danh sách khách + Lead Pool + filter + import + bulk assign | DataTable + import wizard |
| `/sales/customers/:id` | Chi tiết + tabs (Hoạt động·Deal·Báo giá·Email·Việc) | Detail page + tabs + Sheet form |
| `/sales/pipeline` | Kanban kéo-thả Deal theo stage | `JobPipelineBoard` |
| `/sales/tasks` | Việc của tôi (Hôm nay/Quá hạn/Sắp tới) | List + reminder + optimistic |
| `/sales/products` | Catalog sản phẩm | DataTable |
| `/settings/sales` | Pipeline · Sản phẩm · Email template · assignment | Settings pattern |

- Sidebar group mới **`KINH DOANH` (Sales)**: Khách hàng · Pipeline · Việc của tôi · Sản phẩm
  (gắn permission, ẩn cả group nếu không có quyền — như spec sidebar hiện tại).
- i18n namespace mới `sales.json` (vi + en đầy đủ); status badge **màu + chữ**; dark mode; design token (no hex).

## Code Style & Testing

- Theo toàn bộ `.claude/rules/` (TS strict, kebab-case file, layered route→controller→service→repo).
- **TDD**: unit cho dedupe khách hàng, đổi stage + ghi `DealStageHistory`, **đồng bộ Deal.amount từ Quote**,
  tính `lineTotal`/`Quote.total`, chuyển lifecycle (WON→CUSTOMER), RBAC owner-scope, reminder scheduling.
- **Integration**: tạo customer (dedupe), claim/assign + Activity OWNER_CHANGED, tạo deal → move ghi history,
  tạo quote + items → Deal.amount đồng bộ, gửi email (mock Resend) ghi Activity + EmailMessage.
- **E2E critical path** (memory *coverage-not-proof*): lead `NEW` → claim → contact (Activity) →
  qualify → tạo Deal → thêm báo giá (amount cập nhật) → kéo qua stage → WIN → Customer thành `CUSTOMER`;
  assert **business outcome** (history đúng, amount đúng, lifecycle đúng), seed đủ state để effect quan sát được.
- UI: skeleton/empty/error đầy đủ; Kanban kéo-thả; Sheet cho form (không Dialog); optimistic update;
  `tabular-nums` cho số tiền; ⌘K-friendly; WCAG AA; i18n vi+en.

## Out of scope (Tier 2 / iteration sau)

- **Email tracking** mở/click, email **sequences** tự động (drip), inbox 2 chiều (reply sync)
- **Round-robin / territory** assignment tự động (chừa sẵn `assignmentMethod`)
- **Lead scoring** tự động, AI gợi ý next-best-action, dự đoán win-rate
- **Hợp đồng & thanh toán** (chuyển deal WON → invoice/contract), tích hợp kế toán
- **Form web public** thu lead (landing page), webhook nhận lead từ Facebook/Google Ads
- **Báo cáo nâng cao**: cohort, sales velocity chi tiết, leaderboard — *dữ liệu đã ghi sẵn qua `DealStageHistory`*
- **Tích hợp lịch** (Google/Outlook) cho meeting; **gọi điện trong app** (VoIP/CTI)
- Chuẩn hóa child table `product_category`; multi-currency quy đổi tỷ giá (MVP: currency per record)

## Non-functional

- Tenant-scoped tuyệt đối; RBAC server-side; mọi đổi trạng thái/đồng bộ tiền trong **transaction**.
- Email + reminder chạy **async (BullMQ)** — không block request; idempotent, retry backoff.
- Tiền dùng `Decimal(18,2)` (không float); format ở client; `currency` per record.
- **Không log PII khách hàng** (email/phone) theo `monitoring.md`; không hardcode secret/API key.
- WCAG AA, dark mode, i18n vi+en, design token (no hex), responsive 768–1440.

## Boundaries

### Always Do
- **Tách Customer ↔ Deal** ngay từ đầu; **không gộp** `lifecycleStatus` (Customer) với `stage` (Deal).
- Mỗi Customer/Deal có **owner**; `null` = Lead Pool; mọi đổi owner ghi Activity `OWNER_CHANGED`.
- Ghi **`DealStageHistory`** mọi lần chuyển stage (kể cả WIN/LOSE).
- **`Deal.amount` luôn dẫn xuất từ báo giá chính** trong transaction — không cho sửa tay rời rạc.
- Enforce RBAC + **owner-scope** ở **server**, không chỉ ẩn UI.
- Chống trùng khách theo email → phone → fuzzy name (+ company B2B).
- LOST/DISQUALIFIED bắt buộc kèm **lý do**.

### Ask First
- Đưa bất kỳ mục Tier 2 nào (email tracking/sequence, round-robin, lead scoring, invoice) vào sớm.
- Tích hợp dịch vụ ngoài (calendar, VoIP, ad webhook, cổng email khác Resend).
- Thêm role/permission ngoài bộ đã định nghĩa, hoặc đổi mô hình owner→team.

### Never Do
- Không gộp Customer vào Deal; không bỏ `DealStageHistory`.
- Không để `Deal.amount` lệch khỏi tổng báo giá chính.
- Không hardcode API key/secret; không log PII khách hàng.
- Không cho rep (không `sales:view_all`) đọc/sửa bản ghi của owner khác.
- Không xóa Product/Customer đã phát sinh giao dịch (archive thay vì xóa).
```
