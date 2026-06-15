# Feature: Fixed Assets Management — Quản lý tài sản công ty

## Objective
Cung cấp module quản lý tài sản/thiết bị của công ty (laptop, chuột, bàn phím, USB, bàn ghế…): theo dõi
**danh mục tài sản**, **cấp phát/thu hồi theo nhân viên**, **lịch sử bảo trì**, và **thanh lý**. Vì hệ
thống là SaaS đa doanh nghiệp, loại tài sản (category) **cấu hình được theo từng tenant** để linh hoạt,
dễ mở rộng. Đây là module nghiệp vụ mới, đứng độc lập (`assets`), wiring đầy đủ RBAC + i18n + self-service.

## Target Users
- **HR_MANAGER / SUPER_ADMIN** (`assets:*`): toàn quyền — CRUD tài sản & loại, cấp phát/thu hồi, ghi nhận
  bảo trì, thanh lý, cấu hình category, export.
- **MANAGER** (`assets:view`, `assets:export`): xem danh mục tài sản & ai đang giữ gì (read-only, như cách
  MANAGER xem `employees`).
- **EMPLOYEE** (`assets:view`): **self-service** — xem read-only danh sách tài sản đang được cấp cho mình.

> Trang `/assets` là **adaptive theo role** (ui-modern §2): người có quyền quản lý thấy bảng quản trị đầy
> đủ toolbar; EMPLOYEE thuần thấy view "Tài sản của tôi". Cùng một route, layout khác nhau theo việc người
> dùng thực sự làm.

## Quyết định phạm vi (đã chốt với người dùng)
1. MVP gồm cả 4: **catalog + cấp phát/thu hồi + bảo trì + thanh lý**.
2. **Không** tính khấu hao/giá trị kế toán — chỉ lưu `purchaseCost` làm tham chiếu. (Fixed-asset accounting
   để dành cho đợt sau nếu cần.)
3. Category **cấu hình theo tenant** (bảng `AssetCategory`), không phải enum cứng.
4. **Có** self-service cho EMPLOYEE (read-only "Tài sản của tôi").

## Core Features

### 1. Cấu hình loại tài sản (AssetCategory) — theo tenant
- CRUD loại tài sản: `name`, `code` (unique/tenant), `description?`, `icon?` (tên Lucide icon).
- Quản lý trong trang **Cài đặt tài sản** (`/settings/assets`), gated `assets:configure` (mirror pattern
  `HolidaySettings` ở SPEC-018).
- **Acceptance**: HR tạo loại "Laptop" / "Chuột" → xuất hiện trong dropdown khi tạo tài sản. Xoá loại đang
  có tài sản → **409** (chặn), kèm thông báo rõ. EMPLOYEE gọi POST category → **403**.

### 2. Danh mục tài sản (Asset catalog) — CRUD
- Bảng tài sản (TanStack Table) với toolbar: search (debounce 300ms), filter (category, status, người giữ),
  sort, density toggle, export.
- Fields: `assetCode` (unique/tenant), `name`, `categoryId`, `serialNumber?`, `brand?`, `model?`,
  `status`, `condition?`, `purchaseDate?`, `purchaseCost?`, `warrantyEndDate?`, `vendor?`, `location?`, `note?`.
- Form dùng **Sheet** (progressive disclosure: thông tin cơ bản → mở rộng "Mua sắm & bảo hành").
- **Acceptance**: HR tạo/sửa tài sản; danh sách hiển thị status badge + người đang giữ (nếu có); skeleton
  khi load; empty state có CTA; số tiền căn phải + `tabular-nums`.

### 3. Cấp phát & thu hồi (Assignment)
- **Cấp phát**: chọn nhân viên + ngày + tình trạng khi giao (`conditionOut`) + ghi chú → tạo
  `AssetAssignment` (ACTIVE), `Asset.status` = `ASSIGNED`.
- **Thu hồi**: ngày trả + tình trạng khi nhận lại (`conditionIn`) + ghi chú → assignment → `RETURNED`,
  `Asset.status` = `AVAILABLE`.
- **Bất biến**: mỗi tài sản có **tối đa 1 assignment ACTIVE** (enforce trong transaction).
- **Acceptance**: cấp phát tài sản `AVAILABLE` → status `ASSIGNED`, người giữ hiển thị đúng; cấp phát tài
  sản đang `ASSIGNED` → **409**. Thu hồi → trở về `AVAILABLE`. Lịch sử ai-giữ-khi-nào lưu đầy đủ.

### 4. Bảo trì / sửa chữa (Maintenance)
- Ghi nhận lần bảo trì: `startedAt`, `description`, `vendor?`, `cost?`; hoàn tất bằng `completedAt`.
- Bắt đầu bảo trì → `Asset.status` = `UNDER_MAINTENANCE`; hoàn tất → `AVAILABLE`.
- **Chặn** bắt đầu bảo trì khi tài sản đang `ASSIGNED` (phải thu hồi trước) → **409**.
- **Acceptance**: HR mở phiếu bảo trì cho tài sản `AVAILABLE` → status `UNDER_MAINTENANCE`; hoàn tất →
  `AVAILABLE`; lịch sử bảo trì + tổng chi phí hiển thị ở trang chi tiết.

### 5. Thanh lý / hết hạn (Disposal)
- Đánh dấu `RETIRED` (thanh lý) hoặc `LOST` (mất/hỏng) + `retirementReason` + `retiredAt` + `retiredById`.
- **Chặn** thanh lý khi đang `ASSIGNED` (thu hồi trước) → **409**. `RETIRED`/`LOST` là trạng thái **terminal**.
- **Acceptance**: HR thanh lý tài sản không được cấp → status `RETIRED`, biến mất khỏi filter "khả dụng",
  còn trong lịch sử; không thể cấp phát lại.

### 6. Self-service "Tài sản của tôi" (EMPLOYEE)
- `GET /assets/mine` → tài sản có assignment ACTIVE gán cho employee của caller (read-only).
- **Acceptance**: EMPLOYEE thấy danh sách tài sản đang giữ; **không** thấy nút quản trị; mọi API ghi → **403**.

### 7. Điều hướng
- Nav item "Tài sản" trong nhóm **Quản lý** (icon `Package`/`Laptop`), gated `assets:view`.
- Nav item "Cài đặt tài sản" trong nhóm **Hệ thống**, gated `assets:configure`.

## Out of Scope (đợt này)
- Khấu hao / giá trị còn lại / báo cáo kế toán tài sản cố định.
- Quy trình **duyệt** khi cấp phát/thu hồi (HR thao tác trực tiếp, không cần approval flow).
- Nhân viên **tự yêu cầu** cấp phát/báo hỏng (request flow) → đợt sau.
- QR/barcode, nhập từ file Excel hàng loạt, đính kèm file/hình tài sản.
- Nghỉ-bù-kho/đa kho nâng cao; gán tài sản cho phòng ban (chỉ gán cho cá nhân ở MVP).
- Thông báo (Notification) khi cấp phát → **Ask First** (xem Boundaries), không bắt buộc MVP.

## Technical Approach

### Data model (Prisma — `apps/api/prisma/schema.prisma`)
Tuân thủ convention hiện có: `cuid()` PK, `@map` snake_case, `tenantId` + `onDelete: Cascade`, `@@index([tenantId, …])`.

```prisma
enum AssetStatus {
  AVAILABLE
  ASSIGNED
  UNDER_MAINTENANCE
  RETIRED   // thanh lý
  LOST      // mất / hỏng không phục hồi
}

enum AssetAssignmentStatus {
  ACTIVE
  RETURNED
}

enum AssetCondition {
  NEW
  GOOD
  FAIR
  POOR
}

model AssetCategory {
  id          String   @id @default(cuid())
  tenantId    String   @map("tenant_id")
  name        String
  code        String                       // ví dụ "LAPTOP"
  description String?
  icon        String?                       // tên Lucide icon (optional)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  tenant Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  assets Asset[]

  @@unique([tenantId, code])
  @@index([tenantId])
  @@map("asset_categories")
}

model Asset {
  id              String          @id @default(cuid())
  tenantId        String          @map("tenant_id")
  categoryId      String          @map("category_id")
  assetCode       String          @map("asset_code")
  name            String
  serialNumber    String?         @map("serial_number")
  brand           String?
  model           String?
  status          AssetStatus     @default(AVAILABLE)
  condition       AssetCondition?
  purchaseDate    DateTime?       @map("purchase_date")
  purchaseCost    Decimal?        @map("purchase_cost") @db.Decimal(14, 2) // tham chiếu, VND
  warrantyEndDate DateTime?       @map("warranty_end_date")
  vendor          String?
  location        String?
  note            String?
  retiredAt       DateTime?       @map("retired_at")
  retirementReason String?        @map("retirement_reason")
  retiredById     String?         @map("retired_by_id")
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")

  tenant       Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  category     AssetCategory     @relation(fields: [categoryId], references: [id])
  assignments  AssetAssignment[]
  maintenances AssetMaintenance[]

  @@unique([tenantId, assetCode])
  @@index([tenantId, status])
  @@index([categoryId])
  @@map("assets")
}

model AssetAssignment {
  id           String                @id @default(cuid())
  tenantId     String                @map("tenant_id")
  assetId      String                @map("asset_id")
  employeeId   String                @map("employee_id")
  status       AssetAssignmentStatus @default(ACTIVE)
  assignedAt   DateTime              @map("assigned_at")
  assignedById String                @map("assigned_by_id")
  conditionOut AssetCondition?       @map("condition_out")
  returnedAt   DateTime?             @map("returned_at")
  returnedById String?               @map("returned_by_id")
  conditionIn  AssetCondition?       @map("condition_in")
  note         String?
  createdAt    DateTime              @default(now()) @map("created_at")
  updatedAt    DateTime              @updatedAt @map("updated_at")

  tenant     Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  asset      Asset     @relation(fields: [assetId], references: [id], onDelete: Cascade)
  employee   Employee  @relation("AssetHolder", fields: [employeeId], references: [id])
  assignedBy Employee  @relation("AssetAssigner", fields: [assignedById], references: [id])
  returnedBy Employee? @relation("AssetReturner", fields: [returnedById], references: [id])

  @@index([tenantId, assetId])
  @@index([tenantId, employeeId, status])
  @@map("asset_assignments")
}

model AssetMaintenance {
  id          String    @id @default(cuid())
  tenantId    String    @map("tenant_id")
  assetId     String    @map("asset_id")
  startedAt   DateTime  @map("started_at")
  completedAt DateTime? @map("completed_at")
  cost        Decimal?  @db.Decimal(14, 2)
  vendor      String?
  description String
  createdById String    @map("created_by_id")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  asset     Asset    @relation(fields: [assetId], references: [id], onDelete: Cascade)
  createdBy Employee @relation("MaintenanceCreator", fields: [createdById], references: [id])

  @@index([tenantId, assetId])
  @@map("asset_maintenances")
}
```
- Thêm back-relations vào `Tenant` (`assetCategories`, `assets`, `assetAssignments`, `assetMaintenances`)
  và `Employee` (held/assigned/returned/maintenance). Người giữ hiện tại = assignment có `status=ACTIVE`
  (tính qua query, **không** denormalize để tránh quan hệ vòng).

### State machine (enforce ở service, trong transaction)
- `AVAILABLE → ASSIGNED` (assign) · `ASSIGNED → AVAILABLE` (return)
- `AVAILABLE → UNDER_MAINTENANCE` (start) · `UNDER_MAINTENANCE → AVAILABLE` (complete) — chặn nếu `ASSIGNED`
- `AVAILABLE | UNDER_MAINTENANCE → RETIRED | LOST` (dispose, terminal) — chặn nếu `ASSIGNED`
- Vi phạm transition → `AppError(409, 'ASSET_INVALID_STATE')`.

### RBAC — permission mới (`packages/shared/src/types/rbac.ts`)
Thêm vào `PERMISSION_CATALOG`:
```ts
assets: ['view', 'create', 'update', 'delete', 'assign', 'maintain', 'dispose', 'configure', 'export'],
```
Cập nhật `SYSTEM_ROLES` (`apps/api/src/domain/rbac/catalog.ts`):
- **HR_MANAGER**: thêm cả 9 key `assets:*`.
- **MANAGER**: `assets:view`, `assets:export`.
- **EMPLOYEE**: `assets:view`.
- (SUPER_ADMIN đã `'*'`.) Catalog + roles tự đồng bộ qua `seedPermissionCatalog` + `syncSystemRolesForTenant`.

### API contracts (`/api/v1/assets`, layered ESM)
Chuẩn envelope `{ success, data }` / `{ success, data, pagination }`; mọi route ghi gated `requirePermission`.
- `GET    /assets/categories`            → `assets:view`
- `POST   /assets/categories`            → `assets:configure`
- `PATCH  /assets/categories/:id`        → `assets:configure`
- `DELETE /assets/categories/:id`        → `assets:configure` (409 nếu còn tài sản)
- `GET    /assets`                        → `assets:view` (filter category/status/q/assigneeId + pagination/sort)
- `GET    /assets/mine`                   → `assets:view` (chỉ tài sản đang gán cho caller)
- `GET    /assets/:id`                    → `assets:view` (kèm assignments + maintenance history)
- `POST   /assets`                        → `assets:create`
- `PATCH  /assets/:id`                    → `assets:update`
- `DELETE /assets/:id`                    → `assets:delete` (chỉ khi chưa từng có assignment/maintenance; nếu có → dùng dispose)
- `POST   /assets/:id/assign`             → `assets:assign`  `{ employeeId, assignedAt, conditionOut?, note? }`
- `POST   /assets/:id/return`             → `assets:assign`  `{ returnedAt, conditionIn?, note? }`
- `POST   /assets/:id/maintenance`        → `assets:maintain` `{ startedAt, description, vendor?, cost? }`
- `PATCH  /assets/:id/maintenance/:mid`   → `assets:maintain` `{ completedAt, cost?, vendor?, description? }`
- `POST   /assets/:id/dispose`            → `assets:dispose` `{ status: 'RETIRED'|'LOST', reason, retiredAt }`
- `GET    /assets/export`                 → `assets:export` (CSV) — *optional, có thể defer sang đợt sau*

Backend bố cục: `app/routes/v1/asset.routes.ts`, `app/controllers/asset.controller.ts`,
`app/validators/asset.validators.ts` (Zod), `domain/assets/` (service + state-machine helper + mappers),
`domain/repositories/asset.repository.ts`.

### Frontend (`apps/web/src/features/assets/`)
- `pages/AssetsPage.tsx` — **adaptive theo role** (management table vs "Tài sản của tôi").
- `pages/AssetDetailPage.tsx` — tabs: Thông tin · Lịch sử cấp phát · Bảo trì.
- `components/`: `AssetTable`, `AssetForm` (Sheet), `AssignAssetSheet`, `ReturnAssetDialog`,
  `MaintenanceSheet`, `DisposeDialog`, `AssetStatusBadge`, `AssetCategorySettings`.
- `hooks/` + `api.ts`: TanStack Query (`useAssets`, `useAsset`, `useMyAssets`, mutations với optimistic
  update + invalidate); `schema.ts` (Zod, dùng chung shape với BE qua `@hrm/shared`); `types.ts`.
- Status badge: bổ sung asset statuses vào `statusConfig` (giữ pattern màu+chữ, dark+light).
- i18n: `i18n/locales/{vi,en}/assets.json` (namespace `assets.*`).
- Shared types: `packages/shared/src/types/asset.ts` + export ở `index.ts`.
- Settings: `pages/AssetSettingsPage.tsx` (category CRUD), route `/settings/assets`.
- Nav: thêm 2 item vào `Sidebar.tsx` (Quản lý → "Tài sản"; Hệ thống → "Cài đặt tài sản") + route trong `router.tsx`.

### Integration points
- Dùng lại `Employee` (assignee), `requirePermission`, `usePermission`/`<Can>`, DataTable/PageHeader/Sheet
  shared, axios interceptor. **Không** đụng các hợp đồng DTO đang STABLE của module khác.

## Code Style
- Tuân thủ `.claude/rules/` (api-conventions, security, error-handling, testing, naming, database) + CLAUDE.md
  design system + ui-modern.md.
- Mọi thao tác ghi gated server-side bằng `requirePermission` (FE chỉ là UX — feedback `rbac-new-screen`).
- Không hardcode màu/spacing; dùng token; `tabular-nums` cho tiền/ngày; status badge có cả màu + chữ.
- State transitions + bất biến "1 ACTIVE assignment/asset" enforce trong `$transaction`.

## Testing Strategy
- **Integration (API) — critical path khẳng định kết quả nghiệp vụ** (feedback `coverage-not-proof`,
  seed đủ state để quan sát hiệu ứng):
  - Cấp phát tài sản `AVAILABLE` → `status=ASSIGNED`, assignment ACTIVE, `GET /assets/mine` của employee đó trả về nó.
  - Thu hồi → `status=AVAILABLE`, assignment `RETURNED`.
  - Cấp phát tài sản đang `ASSIGNED` → **409**; thanh lý/bảo trì khi `ASSIGNED` → **409**.
  - EMPLOYEE: `/assets/mine` chỉ trả tài sản của mình; `POST /assets` & `/assign` → **403**.
  - Xoá category còn tài sản → **409**.
  - Tenant isolation: tenant A không thấy/không thao tác được tài sản tenant B.
  - Validator: thiếu field bắt buộc → **422**.
- **FE unit**: `AssetsPage` render management table cho HR, "Tài sản của tôi" cho EMPLOYEE; `AssetForm` validation.
- **Live verify** (feedback `test-before-done`): screenshot light+dark — danh sách, chi tiết (tabs),
  sheet cấp phát.

## Boundaries
### Always Do
- Gate mọi write bằng `requirePermission('assets:…')` ở server; wire RBAC end-to-end cho cả 2 trang mới.
- Giữ bất biến tối đa 1 assignment ACTIVE/asset; enforce state machine trong transaction.
- i18n đầy đủ vi/en; không hardcode text tiếng Việt.

### Ask First
- Thêm **Notification** khi cấp phát/thu hồi (reuse `Notification` model).
- Gán tài sản cho **phòng ban** (thay vì chỉ cá nhân).
- Cho phép EMPLOYEE **tự gửi yêu cầu** (cấp phát/báo hỏng) → cần approval flow.
- Export Excel/CSV nếu muốn đưa vào MVP (mặc định defer).

### Never Do
- Không tính khấu hao trong đợt này.
- Không cho cấp phát/bảo trì/thanh lý vi phạm state machine (luôn 409, không "âm thầm" sửa).
- Không commit khi chưa được yêu cầu rõ ràng (feedback `no-commit`).
- Không đổi shape DTO STABLE của module khác.

---
*Created: 2026-06-05 | SPEC-021 | Tuân thủ /CLAUDE.md + .claude/rules + ui-modern.md*
