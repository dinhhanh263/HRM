# SPEC-048: Ngân sách & Dòng tiền (Budget & Cash Flow Management)

**Status:** Draft (discovery resolved 2026-07-01)
**Created:** 2026-07-01
**Author:** Claude + Hạnh
**Depends on:** SPEC-003 (Authorization/RBAC), SPEC-005 (Leave Approval Flow — routing engine tái dùng), SPEC-041 (Payment Request — dòng tiền ra), SPEC-042 (Purchase Request — đặt hàng NCC), SPEC-043 (Issuing Entities — pháp nhân), Department module

---

## Objective

Cho **HR/Finance staff** một "tháp kiểm soát" (control tower) tài chính vận hành: thấy rõ
**dòng tiền vào/ra**, **số dư hiện tại từng tài khoản quỹ**, tổng hợp **kế hoạch chi tiêu
của từng bộ phận**, và **dự báo** liệu số dư có đủ chi trong tháng hay không. Khi dự báo
thiếu hụt, hệ thống giúp tạo **đề xuất nạp quỹ trình Founder** kèm **giải trình tự sinh từ
kế hoạch chi** — rút ngắn quy trình xin nạp tiền (hiện mất cả tuần và cần giải trình thủ công).
Tách bạch số liệu theo **pháp nhân** (Codecrush vs Ha Le) nhưng vẫn xem được **tổng gộp**.

## Vấn đề cần giải

- HR đang kiểm soát chi tiêu bằng Excel rời rạc: không thấy tức thời số dư, không biết
  tổng kế hoạch chi các bộ phận, không dự báo được thời điểm cạn tiền.
- Các khoản chi thực tế đã có kênh riêng (Payment Request, Purchase Request, Payroll)
  nhưng **không được tổng hợp** vào một bức tranh dòng tiền duy nhất.
- Xin Founder nạp thêm tiền mất cả tuần vì phải giải trình thủ công → cần **chủ động dự
  báo sớm** + **giải trình có sẵn** từ kế hoạch chi của các bộ phận.
- Tiền vào đến từ nhiều kênh (Ecom bán hàng + nguồn khác) chưa được ghi nhận tập trung.

## Quyết định discovery (đã chốt 2026-07-01)

1. **Nguồn dữ liệu MVP = nhập tay + import Excel/sao kê.** KHÔNG tích hợp API ngân hàng/Ecom
   trong iteration đầu (để GĐ4). Tái dùng **cơ chế import Excel stateless** đã làm cho
   Purchase Request (SPEC-047: parse → preview → confirm).
2. **Kế hoạch chi do bộ phận tự nhập, HR duyệt.** Trưởng bộ phận (`MANAGER`) nhập kế hoạch
   chi tháng cho **bộ phận của mình**; HR/Finance (`HR_MANAGER`) duyệt & tổng hợp. Tái dùng
   mô hình DRAFT → SUBMITTED → APPROVED/REJECTED (không cần routing engine nhiều bước — duyệt
   1 cấp bởi Finance).
3. **Đa pháp nhân, tách rõ.** Mọi tài khoản quỹ / giao dịch / kế hoạch / đề xuất nạp quỹ gắn
   **`issuingEntityId`** (dùng lại model `IssuingEntity` sẵn có). Mọi màn hình có **bộ lọc
   pháp nhân** + tuỳ chọn **"Tất cả pháp nhân"** để xem tổng gộp.
4. **"Founder" = `SUPER_ADMIN`** (đồng nhất với SPEC-041). Đề xuất nạp quỹ duyệt bởi Founder.
5. **Dòng tiền IN/OUT thống nhất trong một sổ (`CashTransaction`).** Giao dịch có 2 trạng
   thái: `ACTUAL` (đã phát sinh — ảnh hưởng số dư & báo cáo) và `PLANNED` (dự kiến — chỉ
   feed dự báo, chưa đụng số dư). Thu Ecom/khác dự kiến = giao dịch `PLANNED` chiều `IN`.
6. **Tiền tệ:** mặc định `VND`, giữ field `currency` nhưng **không quy đổi đa tệ** ở MVP.
   Số tiền lưu `Decimal(14,2)`.
7. **Chưa auto-kéo Payment/Purchase Request vào sổ chi ở MVP** — để GĐ4. Ở MVP người dùng
   nhập/import tay. (Model đã chừa field `source` + `sourceRefId` để nối sau.)
8. **Nhóm sidebar tận dụng nhóm "Tài chính" (`groups.finance`)** đã tạo ở SPEC-041; thêm các
   menu con của module này vào cùng nhóm.

## Target Users

| User | Actions |
|------|---------|
| **HR/Finance staff** (`HR_MANAGER`) | Quản lý tài khoản quỹ; nhập/import giao dịch thu-chi; xem Dashboard & dự báo; duyệt kế hoạch chi các bộ phận; tạo & trình đề xuất nạp quỹ; xuất báo cáo |
| **Trưởng bộ phận** (`MANAGER`) | Nhập/sửa/gửi **kế hoạch chi của bộ phận mình**; xem trạng thái duyệt kế hoạch đó |
| **Founder** (`SUPER_ADMIN`) | Thấy tất cả; **duyệt/từ chối đề xuất nạp quỹ**; xem toàn bộ Dashboard & báo cáo đa pháp nhân |

---

## Lộ trình (phased) — MVP = Giai đoạn 1

| GĐ | Nội dung | Trạng thái spec |
|----|----------|-----------------|
| **1 — MVP** | Tài khoản quỹ + Danh mục + Sổ giao dịch (nhập tay + import Excel) + Dashboard số dư & dòng tiền in/out | **Chi tiết đầy đủ dưới đây** |
| **2** | Kế hoạch chi theo bộ phận (nhập → duyệt) + Budget vs Actual + Dự báo & cảnh báo thiếu hụt | Đặc tả ở mức feature + data model |
| **3** | Đề xuất nạp quỹ (giải trình tự sinh + export PDF + duyệt Founder) + Báo cáo đa pháp nhân | Đặc tả ở mức feature + data model |
| **4** | Auto-kéo Payment/Purchase Request đã duyệt vào sổ chi + tích hợp API Ecom/ngân hàng | Out of scope spec này (ghi định hướng) |

---

## Core Features

### GIAI ĐOẠN 1 (MVP)

#### 1. Tài khoản quỹ (Fund Account)
**Acceptance Criteria:**
- [ ] CRUD tài khoản quỹ: `name`, `type` (`BANK` | `CASH` | `EWALLET`), `issuingEntityId`
      (bắt buộc — thuộc pháp nhân nào), `currency` (default `VND`), `openingBalance`.
- [ ] `currentBalance` **tính từ** `openingBalance + Σ(IN actual) − Σ(OUT actual)` — không nhập tay,
      recompute khi giao dịch thay đổi (denormalized để đọc nhanh, có job/logic đồng bộ).
- [ ] Vô hiệu hoá (`active=false`) thay vì xoá cứng nếu đã có giao dịch.
- [ ] Danh sách tài khoản hiển thị số dư hiện tại + badge pháp nhân.

#### 2. Danh mục (Finance Category)
**Acceptance Criteria:**
- [ ] CRUD danh mục phân cấp (`parentId` tối đa 2 cấp), `kind` = `INCOME` | `EXPENSE`.
- [ ] Seed sẵn danh mục EXPENSE thường dùng: Ads, Hàng hoá (thớt teak…), Văn phòng phẩm,
      Thuê văn phòng, Freelancer, Lương, Thuế/Phí, Khác; danh mục INCOME: Ecom, Nguồn khác.
- [ ] Danh mục vô hiệu hoá được, không xoá nếu đang gắn giao dịch.

#### 3. Sổ giao dịch thu/chi (Cash Transaction Ledger)
**Acceptance Criteria:**
- [ ] Tạo giao dịch: `accountId`, `direction` (`IN`|`OUT`), `amount` > 0, `occurredAt` (ngày
      phát sinh), `categoryId`, `departmentId` (tuỳ chọn), `issuingEntityId` (mặc định lấy từ
      tài khoản), `description`, `reference` (số chứng từ/mã CK), `status` (`ACTUAL` default).
- [ ] Sửa/xoá giao dịch (có quyền) → **recompute số dư tài khoản** trong cùng transaction.
- [ ] **Import Excel/CSV**: tải template → điền → upload → **preview đối chiếu** (map cột,
      cảnh báo dòng lỗi: account/category không tồn tại, amount ≤ 0, ngày sai) → **confirm**
      tạo hàng loạt. Tái dùng pattern parse stateless của SPEC-047.
- [ ] Danh sách + **bộ lọc**: pháp nhân, tài khoản, danh mục, bộ phận, chiều (IN/OUT),
      trạng thái (ACTUAL/PLANNED), khoảng ngày, tìm theo mô tả/số CT. Phân trang server-side.
- [ ] Hiển thị **tổng IN, tổng OUT, net** theo bộ lọc hiện tại. Số dùng `tabular-nums`.

#### 4. Dashboard Dòng tiền (MVP)
**Acceptance Criteria:**
- [ ] Bộ chọn pháp nhân (một pháp nhân | tất cả) + kỳ (mặc định tháng hiện tại).
- [ ] Thẻ KPI: **Tổng số dư hiện tại** (theo tài khoản đã lọc), **Thu trong kỳ** (ACTUAL IN),
      **Chi trong kỳ** (ACTUAL OUT), **Net kỳ**.
- [ ] Biểu đồ **dòng tiền in/out theo thời gian** (cột IN/OUT theo ngày/tuần) + đường số dư luỹ kế.
- [ ] Bảng **chi theo danh mục** (top hạng mục tốn nhất trong kỳ).
- [ ] Skeleton khi load; empty state có CTA (tạo tài khoản/giao dịch đầu tiên).

### GIAI ĐOẠN 2 (kế hoạch chi + dự báo)

#### 5. Kế hoạch chi theo bộ phận (Spending Plan)
**Acceptance Criteria:**
- [ ] Trưởng bộ phận tạo kế hoạch chi cho **bộ phận mình + kỳ (tháng)**: nhiều dòng
      (`SpendingPlanItem`): `categoryId`, `title`, `amount`, `expectedDate`, `note` (lý do).
- [ ] Vòng đời: `DRAFT` → `SUBMITTED` → `APPROVED` | `REJECTED` (Finance duyệt, note khi từ chối).
- [ ] Một bộ phận **một kế hoạch/kỳ** (unique `departmentId + period + issuingEntityId`); bị
      từ chối thì sửa & gửi lại.
- [ ] HR/Finance có **màn tổng hợp toàn công ty**: tổng kế hoạch chi theo bộ phận / danh mục /
      pháp nhân trong kỳ; lọc trạng thái.

#### 6. Budget vs Actual
**Acceptance Criteria:**
- [ ] Đối chiếu **kế hoạch (APPROVED)** vs **thực chi (ACTUAL OUT)** theo bộ phận & danh mục
      trong kỳ: số kế hoạch, số thực, chênh lệch, % đã dùng.
- [ ] Cảnh báo **vượt kế hoạch** (thực > kế hoạch) bằng badge màu + chữ.

#### 7. Dự báo & Cảnh báo thiếu hụt (Cash Flow Forecast)
**Acceptance Criteria:**
- [ ] Tính **số dư dự phóng cuối kỳ** = số dư hiện tại + Σ(thu dự kiến) − Σ(chi dự kiến),
      trong đó: thu dự kiến = giao dịch `PLANNED IN` (Ecom/khác); chi dự kiến = kế hoạch chi
      `APPROVED` (theo `expectedDate`) **+** giao dịch `PLANNED OUT`.
- [ ] Dựng **đường số dư theo ngày** trong kỳ → xác định **ngày cạn tiền** (số dư < 0 lần đầu)
      và **số tiền thiếu hụt** cuối kỳ.
- [ ] Nếu dự phóng < 0 → banner cảnh báo trên Dashboard: "Đủ chi đến **ngày X**, sau đó thiếu
      **Y đ**" + nút **"Tạo đề xuất nạp quỹ"** (GĐ3).

### GIAI ĐOẠN 3 (đề xuất nạp quỹ + báo cáo)

#### 8. Đề xuất nạp quỹ (Top-up Request)
**Acceptance Criteria:**
- [ ] Tạo đề xuất: `issuingEntityId`, `amount`, `neededByDate`, `title`; **giải trình tự sinh**
      từ kế hoạch chi APPROVED + thiếu hụt dự báo của kỳ (liệt kê khoản/bộ phận/lý do/thời điểm),
      cho phép **sửa** trước khi gửi.
- [ ] Vòng đời: `PENDING` → `APPROVED` | `REJECTED` (Founder duyệt) | `CANCELLED` (người tạo huỷ khi PENDING).
- [ ] Khi Founder **duyệt** → tuỳ chọn ghi nhận nạp: tạo giao dịch `IN ACTUAL` vào tài khoản đã
      chọn (`fundedAccountId`, `fundedAt`).
- [ ] **Export PDF** bản giải trình để trình/lưu (tái dùng hạ tầng render PDF của Purchase Request).

#### 9. Báo cáo đa pháp nhân
**Acceptance Criteria:**
- [ ] Báo cáo thu/chi theo **tháng / bộ phận / danh mục / pháp nhân**; so sánh kỳ trước.
- [ ] Xuất Excel theo bộ lọc. Xem tách từng pháp nhân hoặc tổng gộp.

---

## Data Model (bổ sung — Prisma)

```prisma
enum TransactionDirection { IN OUT }
enum TransactionStatus    { ACTUAL PLANNED }
enum CategoryKind         { INCOME EXPENSE }
enum FundAccountType      { BANK CASH EWALLET }
enum TransactionSource    { MANUAL IMPORT PAYMENT_REQUEST PURCHASE_REQUEST PAYROLL }
enum SpendingPlanStatus   { DRAFT SUBMITTED APPROVED REJECTED }
enum TopUpStatus          { PENDING APPROVED REJECTED CANCELLED }

// GĐ1
model FundAccount {
  id              String   @id @default(cuid())
  tenantId        String   @map("tenant_id")
  issuingEntityId String   @map("issuing_entity_id")        // pháp nhân sở hữu quỹ
  name            String
  type            FundAccountType @default(BANK)
  currency        String   @default("VND")
  openingBalance  Decimal  @db.Decimal(14, 2) @default(0) @map("opening_balance")
  currentBalance  Decimal  @db.Decimal(14, 2) @default(0) @map("current_balance") // denormalized
  active          Boolean  @default(true)
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  tenant        Tenant        @relation(fields: [tenantId], references: [id])
  issuingEntity IssuingEntity @relation(fields: [issuingEntityId], references: [id])
  transactions  CashTransaction[]

  @@index([tenantId, issuingEntityId])
  @@map("fund_accounts")
}

model FinanceCategory {
  id        String   @id @default(cuid())
  tenantId  String   @map("tenant_id")
  kind      CategoryKind
  name      String
  parentId  String?  @map("parent_id")
  active    Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at")

  tenant   Tenant            @relation(fields: [tenantId], references: [id])
  parent   FinanceCategory?  @relation("CategoryTree", fields: [parentId], references: [id])
  children FinanceCategory[] @relation("CategoryTree")
  transactions   CashTransaction[]
  planItems      SpendingPlanItem[]

  @@index([tenantId, kind])
  @@map("finance_categories")
}

model CashTransaction {
  id              String   @id @default(cuid())
  tenantId        String   @map("tenant_id")
  accountId       String   @map("account_id")
  issuingEntityId String   @map("issuing_entity_id")
  direction       TransactionDirection
  status          TransactionStatus @default(ACTUAL)
  amount          Decimal  @db.Decimal(14, 2)
  currency        String   @default("VND")
  occurredAt      DateTime @map("occurred_at")               // ngày phát sinh / dự kiến
  categoryId      String?  @map("category_id")
  departmentId    String?  @map("department_id")
  description     String?
  reference       String?                                    // số CT / mã chuyển khoản
  source          TransactionSource @default(MANUAL)
  sourceRefId     String?  @map("source_ref_id")             // nối PR/Payment/Payroll (GĐ4)
  createdById     String   @map("created_by_id")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  tenant        Tenant           @relation(fields: [tenantId], references: [id])
  account       FundAccount      @relation(fields: [accountId], references: [id])
  issuingEntity IssuingEntity    @relation(fields: [issuingEntityId], references: [id])
  category      FinanceCategory? @relation(fields: [categoryId], references: [id])
  department    Department?      @relation(fields: [departmentId], references: [id])

  @@index([tenantId, issuingEntityId, occurredAt])
  @@index([accountId, status])
  @@map("cash_transactions")
}

// GĐ2
model SpendingPlan {
  id              String   @id @default(cuid())
  tenantId        String   @map("tenant_id")
  departmentId    String   @map("department_id")
  issuingEntityId String   @map("issuing_entity_id")
  period          String                                    // "YYYY-MM"
  status          SpendingPlanStatus @default(DRAFT)
  totalAmount     Decimal  @db.Decimal(14, 2) @default(0) @map("total_amount") // denormalized
  submittedById   String?  @map("submitted_by_id")
  submittedAt     DateTime? @map("submitted_at")
  reviewedById    String?  @map("reviewed_by_id")
  reviewedAt      DateTime? @map("reviewed_at")
  reviewNote      String?  @map("review_note")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  tenant        Tenant        @relation(fields: [tenantId], references: [id])
  department    Department    @relation(fields: [departmentId], references: [id])
  issuingEntity IssuingEntity @relation(fields: [issuingEntityId], references: [id])
  items         SpendingPlanItem[]

  @@unique([departmentId, period, issuingEntityId])
  @@index([tenantId, period, status])
  @@map("spending_plans")
}

model SpendingPlanItem {
  id           String   @id @default(cuid())
  planId       String   @map("plan_id")
  categoryId   String?  @map("category_id")
  title        String
  amount       Decimal  @db.Decimal(14, 2)
  expectedDate DateTime? @map("expected_date")
  note         String?
  plan     SpendingPlan     @relation(fields: [planId], references: [id], onDelete: Cascade)
  category FinanceCategory? @relation(fields: [categoryId], references: [id])
  @@index([planId])
  @@map("spending_plan_items")
}

// GĐ3
model TopUpRequest {
  id              String   @id @default(cuid())
  tenantId        String   @map("tenant_id")
  issuingEntityId String   @map("issuing_entity_id")
  title           String
  amount          Decimal  @db.Decimal(14, 2)
  currency        String   @default("VND")
  neededByDate    DateTime? @map("needed_by_date")
  justification   String                                    // giải trình (tự sinh + sửa được)
  period          String?                                   // "YYYY-MM" kỳ liên quan
  status          TopUpStatus @default(PENDING)
  reviewedById    String?  @map("reviewed_by_id")
  reviewedAt      DateTime? @map("reviewed_at")
  reviewNote      String?  @map("review_note")
  fundedAccountId String?  @map("funded_account_id")        // tài khoản được nạp khi duyệt
  fundedAt        DateTime? @map("funded_at")
  createdById     String   @map("created_by_id")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  tenant        Tenant        @relation(fields: [tenantId], references: [id])
  issuingEntity IssuingEntity @relation(fields: [issuingEntityId], references: [id])

  @@index([tenantId, status])
  @@map("topup_requests")
}
```

> Back-relations bổ sung vào `Tenant`, `IssuingEntity`, `Department` tương ứng (additive, không phá schema hiện có).

## API (dưới `/api/v1`)

**GĐ1**
| Method | Path | Permission | Notes |
|--------|------|-----------|-------|
| GET/POST | `/fund-accounts` | `fund_account:view` / `:create` | list (lọc pháp nhân) / tạo |
| PATCH/DELETE | `/fund-accounts/:id` | `fund_account:update` / `:delete` | sửa / vô hiệu hoá |
| GET/POST | `/finance-categories` | `finance:view` / `cash_transaction:create` | danh mục |
| GET | `/cash-transactions` | `cash_transaction:view` | list + filter + tổng IN/OUT/net |
| POST/PATCH/DELETE | `/cash-transactions/:id?` | `cash_transaction:create/update/delete` | recompute số dư trong transaction |
| GET | `/cash-transactions/import/template` | `cash_transaction:import` | tải template xlsx/csv |
| POST | `/cash-transactions/import/parse` | `cash_transaction:import` | parse stateless → preview |
| POST | `/cash-transactions/import/confirm` | `cash_transaction:import` | tạo hàng loạt |
| GET | `/finance/dashboard` | `finance:view` | KPI + chuỗi in/out + chi theo danh mục |

**GĐ2**
| GET/POST | `/spending-plans` | `spending_plan:view` / `:create` | plan của bộ phận / tổng hợp |
| PATCH | `/spending-plans/:id` | `spending_plan:update` (owner dept) | sửa DRAFT/REJECTED |
| POST | `/spending-plans/:id/submit` | `spending_plan:submit` | DRAFT → SUBMITTED |
| POST | `/spending-plans/:id/review` | `spending_plan:approve` | `{decision, note}` → APPROVED/REJECTED |
| GET | `/finance/budget-vs-actual` | `finance:view` | đối chiếu kế hoạch vs thực chi |
| GET | `/finance/forecast` | `finance:view` | số dư dự phóng + ngày cạn tiền + thiếu hụt |

**GĐ3**
| GET/POST | `/topup-requests` | `topup_request:view` / `:create` | tạo (giải trình tự sinh) |
| POST | `/topup-requests/:id/review` | `topup_request:approve` | Founder duyệt/từ chối (+ tuỳ chọn nạp) |
| POST | `/topup-requests/:id/cancel` | (ownership) | huỷ khi PENDING |
| GET | `/topup-requests/:id/pdf` | `topup_request:export` | export PDF giải trình |
| GET | `/finance/reports` | `finance:export` | báo cáo thu/chi đa chiều + export Excel |

## Permissions (thêm mới)

Thêm vào `PERMISSION_CATALOG` (`packages/shared/src/types/rbac.ts`), giữ pattern `resource:action`:
```
finance:            ['view', 'export']
fund_account:       ['view', 'create', 'update', 'delete']
cash_transaction:   ['view', 'create', 'update', 'delete', 'import']
spending_plan:      ['view', 'create', 'update', 'submit', 'approve', 'reject']
topup_request:      ['view', 'create', 'approve', 'reject', 'export']
```

Gán trong `apps/api/src/domain/rbac/catalog.ts` (chạy lại `seed-rbac-only.ts`):

| Role | Quyền |
|------|-------|
| `SUPER_ADMIN` (Founder) | `*` (implicit-all) — gồm duyệt topup |
| `HR_MANAGER` (Finance) | finance:*, fund_account:*, cash_transaction:*, spending_plan:(view,approve,reject), topup_request:(view,create,export) |
| `MANAGER` (trưởng bộ phận) | spending_plan:(view,create,update,submit) — **giới hạn bộ phận mình ở server**; finance:view (giới hạn dữ liệu bộ phận — iteration sau) |
| `EMPLOYEE` | (không) |

> `spending_plan:create/update/submit` ở MANAGER **cộng** kiểm tra "đúng bộ phận mình quản lý"
> ở service (giống ràng buộc "đúng người duyệt" của SPEC-041). `topup_request:approve` chỉ Founder.

## Tái sử dụng hạ tầng

| Thành phần | Chiến lược |
|-----------|-----------|
| `IssuingEntity` (SPEC-043) | **Dùng nguyên** làm khái niệm pháp nhân; FK từ account/transaction/plan/topup |
| Import Excel stateless (SPEC-047) | **Nhân bản** cho `cash_transaction` (parse → preview → confirm) |
| Render PDF của Purchase Request | **Nhân bản** cho PDF giải trình đề xuất nạp quỹ (GĐ3) |
| RBAC middleware/hook, Sidebar RBAC filter | **Dùng nguyên** |
| Nhóm sidebar `groups.finance` (SPEC-041) | **Dùng lại**, thêm menu con |
| TanStack Query + DataTable + Sheet/Recharts | **Dùng nguyên** (pattern chung) |

## i18n

- Namespace mới `finance.json` (vi + en) cho toàn bộ chuỗi module.
- Bổ sung `nav.json`: `items.financeDashboard`, `items.fundAccounts`, `items.cashTransactions`,
  `items.spendingPlans`, `items.topupRequests` + `titles.*` tương ứng (trong `groups.finance`).

## Out of scope (spec này)

- **Tích hợp API ngân hàng/Ecom** (Shopee/TikTok/web…) để auto-sync thu/chi — GĐ4.
- **Auto-kéo** Payment/Purchase Request/Payroll đã duyệt thành giao dịch chi — GĐ4 (đã chừa
  `source`/`sourceRefId`).
- **Đa tiền tệ + tỷ giá** (giữ `currency` nhưng không quy đổi).
- Kế toán kép / sổ cái tổng hợp (general ledger), báo cáo tài chính chuẩn mực (P&L, balance sheet).
- Đối soát công nợ nhà cung cấp/khách hàng (AR/AP), vendor master.
- Cấu hình luồng duyệt kế hoạch/topup trong UI (duyệt 1 cấp cố định).
- Phân quyền dữ liệu MANAGER chỉ-thấy-bộ-phận-mình trên Dashboard (MVP cho xem tổng; siết sau).

## Non-functional

- **Tenant-scoped tuyệt đối**; RBAC **server-side**; mọi thay đổi ảnh hưởng số dư nằm trong
  **transaction** (tạo/sửa/xoá giao dịch → recompute `currentBalance` nguyên tử).
- Tiền: `Decimal(14,2)`, **không dùng float**; format hiển thị `tabular-nums` + `formatCurrency`.
- Import: validate MIME + kích thước + từng dòng **ở server**; preview trước khi ghi.
- TDD: logic tính số dư, dự báo (ngày cạn tiền / thiếu hụt), budget-vs-actual, ràng buộc
  "MANAGER chỉ bộ phận mình".
- E2E critical-path (assert **business outcome**, seed đủ state):
  1. Tạo tài khoản → nhập 1 IN + 1 OUT → số dư & KPI Dashboard đúng.
  2. Import Excel 3 dòng (1 dòng lỗi) → preview chặn dòng lỗi, confirm 2 dòng hợp lệ.
  3. (GĐ2) MANAGER gửi kế hoạch → HR duyệt → forecast tính đúng ngày cạn tiền/thiếu hụt.
  4. (GĐ3) Thiếu hụt → tạo topup (giải trình tự sinh) → Founder duyệt → sinh giao dịch IN.
- UI: skeleton/empty/error đầy đủ; status badge **màu + chữ**; dark mode; i18n vi+en;
  design token (no hex); WCAG AA; responsive 768–1440.

## Boundaries

### Always Do
- Gắn `issuingEntityId` cho mọi bản ghi tài chính; mọi truy vấn **lọc theo tenant** trước.
- Recompute số dư trong cùng DB transaction với thay đổi giao dịch.
- Enforce "MANAGER chỉ thao tác kế hoạch của bộ phận mình" ở **server**, không chỉ ẩn UI.
- Chỉ tính dự báo từ: `PLANNED IN` (thu) + kế hoạch `APPROVED`/`PLANNED OUT` (chi) — không lẫn ACTUAL.
- Note **bắt buộc** khi từ chối kế hoạch chi / đề xuất nạp quỹ.

### Ask First
- Thay đổi công thức số dư/dự báo hoặc thêm khái niệm sổ cái kép.
- Bật auto-kéo PR/Payment vào sổ chi (đổi nguồn dữ liệu — có thể trùng lặp số liệu).

### Never Do
- Không dùng float cho tiền; không nhập tay `currentBalance`.
- Không để MANAGER xem/sửa dữ liệu tài chính của pháp nhân/bộ phận khác.
- Không hardcode "Founder" bằng email — dùng `SUPER_ADMIN` qua RBAC.
- Không xoá cứng tài khoản/danh mục đã có giao dịch (vô hiệu hoá thay thế).
