# Plan: Fixed Assets Management (SPEC-021)

> Spec: `docs/specs/021-fixed-assets-management.md`
> Nguyên tắc: vertical slices · foundation-first · risk-first · test khẳng định kết quả nghiệp vụ.

## Bối cảnh kỹ thuật (khảo sát codebase — read-only)
- **Backend** (`apps/api`, ESM, layered): route files trong `src/app/routes/v1/*.routes.ts` được gom qua
  aggregator `routes` và mount tại `/api/v1` (`app.ts:26`). Mỗi route: `authenticate` (router.use) →
  `requirePermission('x:y')` → `validate(zodSchema)` → `controller`. Domain logic ở `src/domain/<feature>/`,
  data access ở `src/domain/repositories/`. Prisma schema `prisma/schema.prisma` (cuid, `@map` snake_case,
  `tenantId` + `onDelete: Cascade`, `@@index`). Seed RBAC qua `seedPermissionCatalog` + `syncSystemRolesForTenant`.
- **Frontend** (`apps/web`): feature-based `src/features/<f>/{components,hooks,pages}` + `api.ts` (TanStack
  Query) + `schema.ts` (Zod) + `types.ts`. Router `src/router.tsx`. Nav `src/components/layout/Sidebar.tsx`
  (`navGroups`: groups `overview|hr|operations|system`, mỗi item có `permission: PermissionKey`, lọc bằng
  `can()`). i18n `src/i18n/locales/{vi,en}/<ns>.json`. RBAC UI: `usePermission().can` / `<Can>` /
  `<RequirePermission>`.
- **Shared** (`packages/shared/src/types`): DTO + `PERMISSION_CATALOG` (`rbac.ts`) là single source of truth;
  export qua `types/index.ts` (đuôi `.js`).

## Integration points (files chạm tới)
- Schema/RBAC: `prisma/schema.prisma`, `packages/shared/src/types/rbac.ts`,
  `apps/api/src/domain/rbac/catalog.ts`, seed (`prisma/seed.ts`).
- BE mới: `domain/assets/` (service, state-machine, mappers), `domain/repositories/asset.repository.ts`,
  `app/controllers/asset.controller.ts`, `app/validators/asset.validator.ts`,
  `app/routes/v1/asset.routes.ts` + đăng ký vào aggregator v1.
- Shared mới: `packages/shared/src/types/asset.ts` + thêm export ở `types/index.ts`.
- FE mới: `features/assets/**`, `pages` mount trong `router.tsx`, 2 nav item trong `Sidebar.tsx`,
  i18n `assets.json` (vi/en) + key nav trong `common`/sidebar ns.

## Tham chiếu kết quả khảo sát
- Route pattern mẫu: `timesheet.routes.ts` (policy + holidays + seed).
- Settings page mẫu (cứu component mồ côi): SPEC-018 `HolidaySettings` + route `/settings/timesheet`.
- Nav: `Sidebar.tsx:45-75` (`navGroups`), lọc theo `can(item.permission)` (`:110`).

---

## Phase 1 — Foundation (DB · types · RBAC)
Horizontal có chủ đích (nền cho mọi slice sau).

### Task 1.1 — Shared types `asset.ts`
- **Objective**: single source of truth cho enums + DTO + request shapes (FE & BE dùng chung).
- **Files**: `packages/shared/src/types/asset.ts`, `packages/shared/src/types/index.ts` (+export).
- **Nội dung**: `AssetStatus`, `AssetAssignmentStatus`, `AssetCondition` (union types); `AssetDto`,
  `AssetCategoryDto`, `AssetAssignmentDto`, `AssetMaintenanceDto`, `AssetDetailDto` (kèm assignments+maintenances);
  request types: `CreateAssetInput`, `UpdateAssetInput`, `AssignAssetInput`, `ReturnAssetInput`,
  `CreateMaintenanceInput`, `CompleteMaintenanceInput`, `DisposeAssetInput`, `AssetListParams`,
  `CreateAssetCategoryInput`, `UpdateAssetCategoryInput`.
- **Verify**: `pnpm --filter @hrm/shared build` (hoặc typecheck) pass.

### Task 1.2 — Prisma schema + migration
- **Objective**: 4 models + 3 enums + back-relations.
- **Files**: `apps/api/prisma/schema.prisma`.
- **Nội dung**: theo block trong spec; thêm relations vào `Tenant` (assetCategories, assets,
  assetAssignments, assetMaintenances) và `Employee` (held/assigned/returned/maintenance-created).
- **Verify**: `pnpm --filter @hrm/api prisma migrate dev --name fixed_assets` → migration tạo & apply;
  `prisma generate` OK; client có `prisma.asset`, `prisma.assetCategory`, …

### Task 1.3 — RBAC permissions + role grants
- **Objective**: thêm resource `assets` + cấp cho HR_MANAGER/MANAGER/EMPLOYEE.
- **Files**: `packages/shared/src/types/rbac.ts` (`PERMISSION_CATALOG.assets`),
  `apps/api/src/domain/rbac/catalog.ts` (SYSTEM_ROLES grants).
- **Nội dung**: `assets: ['view','create','update','delete','assign','maintain','dispose','configure','export']`;
  HR_MANAGER = cả 9; MANAGER = `view,export`; EMPLOYEE = `view`.
- **Verify**: chạy seed (`prisma/seed.ts`) trên DB dev → `permissions` có 9 key `assets:*`; ma trận role có cột Tài sản.

### ✅ Checkpoint: Foundation
- [ ] migration applied, `prisma generate` OK · [ ] shared + api typecheck pass · [ ] seed tạo 9 permission `assets:*`
- [ ] `pnpm typecheck` toàn workspace pass.

---

## Phase 2 — Cấu hình loại tài sản (AssetCategory) — vertical, quick win + de-risk "configurable category"

### Task 2.1 — BE: Category CRUD
- **Files**: `domain/repositories/asset.repository.ts` (phần category), `domain/assets/category.service.ts`,
  `app/validators/asset.validator.ts` (category schemas), `app/controllers/asset.controller.ts`,
  `app/routes/v1/asset.routes.ts` + đăng ký aggregator v1.
- **Routes**: `GET /assets/categories` (`assets:view`), `POST|PATCH|DELETE` (`assets:configure`); DELETE chặn
  409 (`ASSET_CATEGORY_IN_USE`) nếu còn asset.
- **AC**: tạo "Laptop"/"Chuột" OK; xoá category có asset → 409; EMPLOYEE POST → 403; `code` unique/tenant (409/422).

### Task 2.2 — FE: feature scaffold + Category settings page
- **Files**: `features/assets/api.ts`, `features/assets/hooks/*`, `features/assets/types.ts`,
  `features/assets/schema.ts`, `features/assets/components/AssetCategorySettings.tsx`,
  `features/assets/pages/AssetSettingsPage.tsx`, `router.tsx` (route `/settings/assets`),
  `components/layout/Sidebar.tsx` (nav "Cài đặt tài sản", group system, `assets:configure`),
  `i18n/locales/{vi,en}/assets.json` + key nav.
- **AC**: HR vào `/settings/assets` quản lý category (Sheet + AlertDialog xoá); nút ghi gated `assets:configure`;
  EMPLOYEE không thấy nav.

### Integration tests (Phase 2)
- Category CRUD happy path; delete-in-use → 409; EMPLOYEE write → 403; tenant isolation.

### ✅ Checkpoint: Category config
- [ ] CRUD chạy thật trên UI · [ ] RBAC end-to-end (FE ẩn + BE 403) · [ ] i18n vi/en đủ.

---

## Phase 3 — Asset catalog CRUD — vertical

### Task 3.1 — BE: Asset CRUD + list + detail
- **Files**: `asset.repository.ts` (asset), `domain/assets/asset.service.ts`, `asset.mappers.ts`,
  validators + controller + routes (mở rộng).
- **Routes**: `GET /assets` (filter `categoryId,status,q,assigneeId` + pagination/sort), `GET /assets/:id`
  (detail kèm history), `POST /assets`, `PATCH /assets/:id`, `DELETE /assets/:id` (chặn 409 nếu đã có
  assignment/maintenance → hướng dùng dispose).
- **AC**: CRUD OK; list filter/sort/paginate đúng envelope `{success,data,pagination}`; delete có history → 409;
  validator thiếu field → 422; tenant isolation.

### Task 3.2 — FE: AssetTable + AssetForm + AssetsPage (management view)
- **Files**: `components/AssetTable.tsx`, `components/AssetForm.tsx` (Sheet, progressive disclosure),
  `components/AssetStatusBadge.tsx`, `pages/AssetsPage.tsx`, `router.tsx` (`/assets`),
  `Sidebar.tsx` (nav "Tài sản", group operations/quản lý, `assets:view`), i18n bổ sung.
- **AC**: bảng có toolbar (search debounce 300ms, filter, sort, density), skeleton load, empty-state CTA,
  tiền `tabular-nums`; tạo/sửa qua Sheet; status badge màu+chữ dark+light.

### Task 3.3 — FE: AssetDetailPage (tab Thông tin)
- **Files**: `pages/AssetDetailPage.tsx` (tabs scaffold; tab "Thông tin" trước), `router.tsx` (`/assets/:id`),
  hook `useAsset`.
- **AC**: mở chi tiết hiển thị đầy đủ field + category + status; tabs "Lịch sử cấp phát"/"Bảo trì" để trống (điền ở Phase 4–5).

### Integration tests (Phase 3)
- Asset CRUD; list filter (status/category); delete-block; 422; tenant isolation.

### ✅ Checkpoint: Catalog complete
- [ ] CRUD + list + detail chạy thật · [ ] screenshot list (dark+light) · [ ] tests xanh.

---

## Phase 4 — Cấp phát/Thu hồi + Self-service — RISK CAO NHẤT (state machine + bất biến)

### Task 4.1 — BE: assign / return (transaction)
- **Files**: `domain/assets/asset-state.helper.ts` (transition guards), `asset.service.ts` (assign/return),
  validators + controller + routes.
- **Routes**: `POST /assets/:id/assign` (`assets:assign`), `POST /assets/:id/return` (`assets:assign`).
- **Logic**: trong `$transaction` — tạo/đóng `AssetAssignment`, đổi `Asset.status`; enforce **tối đa 1 ACTIVE**;
  transition sai → `AppError(409,'ASSET_INVALID_STATE')`.
- **AC**: assign `AVAILABLE`→`ASSIGNED` + assignment ACTIVE; assign khi `ASSIGNED`→409; return→`AVAILABLE` +
  assignment `RETURNED` + `returnedAt/By/conditionIn`.

### Task 4.2 — FE: AssignAssetSheet + ReturnAssetDialog + tab Lịch sử cấp phát
- **Files**: `components/AssignAssetSheet.tsx` (chọn employee + ngày + condition + note),
  `components/ReturnAssetDialog.tsx`, `pages/AssetDetailPage.tsx` (tab "Lịch sử cấp phát"),
  `AssetTable` (cột người-đang-giữ), hooks/api (optimistic + invalidate).
- **AC**: HR cấp phát/thu hồi từ UI; bảng & chi tiết phản ánh đúng người giữ + lịch sử; lỗi 409 → toast rõ.

### Task 4.3 — Self-service "Tài sản của tôi" + adaptive AssetsPage
- **Files**: BE `GET /assets/mine` (`assets:view`, scope theo employee của caller); FE `useMyAssets`,
  `AssetsPage` rẽ nhánh theo `can('assets:create'|'assets:assign')` → management table vs read-only "Tài sản của tôi".
- **AC**: EMPLOYEE thấy đúng tài sản đang giữ, không thấy nút quản trị; `GET /mine` chỉ trả của mình;
  EMPLOYEE gọi `/assign` → 403.

### Integration tests (Phase 4)
- assign/return happy path; double-assign 409; `/mine` scoping + assign cập nhật `/mine`; EMPLOYEE write 403.

### ✅ Checkpoint: Assignment complete
- [ ] state machine + bất biến đúng dưới concurrent (transaction) · [ ] self-service chạy thật ·
  [ ] screenshot Assign sheet + my-assets (EMPLOYEE).

---

## Phase 5 — Bảo trì + Thanh lý — vertical (dựa trên state machine)

### Task 5.1 — BE: maintenance + dispose
- **Files**: `asset.service.ts` (maintenance start/complete, dispose), validators + controller + routes.
- **Routes**: `POST /assets/:id/maintenance` (start), `PATCH /assets/:id/maintenance/:mid` (complete) —
  `assets:maintain`; `POST /assets/:id/dispose` (`assets:dispose`).
- **Logic**: start→`UNDER_MAINTENANCE` (409 nếu `ASSIGNED`); complete→`AVAILABLE`; dispose→`RETIRED|LOST`
  terminal (409 nếu `ASSIGNED`) + `retiredAt/Reason/ById`.
- **AC**: theo spec §4–5; 409 guards; terminal không cấp phát lại được.

### Task 5.2 — FE: MaintenanceSheet + tab Bảo trì + DisposeDialog
- **Files**: `components/MaintenanceSheet.tsx`, `components/DisposeDialog.tsx`,
  `pages/AssetDetailPage.tsx` (tab "Bảo trì": list + tổng chi phí `tabular-nums`), badges.
- **AC**: mở/hoàn tất bảo trì + thanh lý từ UI; lịch sử + tổng chi phí hiển thị; status badge cập nhật.

### Integration tests (Phase 5)
- maintenance start/complete + status; dispose terminal; 409 khi ASSIGNED.

### ✅ Checkpoint: Feature complete
- [ ] toàn bộ vòng đời (mua→cấp→bảo trì→thu hồi→thanh lý) chạy thật.

---

## Phase 6 — Polish & verify
- **Task 6.1** FE unit tests: `AssetsPage` adaptive (HR table vs EMPLOYEE my-assets), `AssetForm` validation,
  Sidebar hiện/ẩn nav theo permission.
- **Task 6.2** A11y + responsive: aria-label cho icon-only, `aria-sort` header, focus-visible, reduced-motion;
  test 768–1440; dark+light.
- **Task 6.3** i18n sweep vi/en (không hardcode); `/review` five-axis.
- **Optional (defer)**: `GET /assets/export` CSV — chỉ làm nếu người dùng xác nhận kéo vào MVP.

### ✅ Checkpoint: Ship-ready
- [ ] `pnpm typecheck` + lint + test toàn workspace xanh · [ ] screenshots minh chứng · [ ] `/review` pass.

---

## Thứ tự & phụ thuộc
1.1 → 1.2 → 1.3 → **CP1** → 2.x → **CP2** → 3.x → **CP3** → 4.x → **CP4** → 5.x → **CP5** → 6.x → **CP6**.
- 1.1/1.3 (shared types + RBAC) độc lập tương đối nhưng cần trước BE.
- Phase 2 trước Phase 3 (asset cần categoryId). Phase 4 sau Phase 3 (cần asset tồn tại). Phase 5 sau Phase 4
  (tái dùng state-machine helper).

## Rủi ro & giảm thiểu
- **Bất biến 1 ACTIVE assignment**: enforce trong `$transaction` + (tuỳ chọn) partial unique index
  `@@unique([assetId]) where status=ACTIVE` — Prisma chưa hỗ trợ partial unique trực tiếp → enforce ở service,
  test concurrent. *Ask First nếu muốn thêm raw SQL partial index.*
- **`assignedById/createdById` là Employee, không phải User**: controller phải map `req.user` → employee của
  tenant (xem cách timesheet/leave lấy `employeeId` của caller) trước khi gọi service.
- **Decimal tiền**: dùng `@db.Decimal(14,2)`; FE format `tabular-nums`, không tính khấu hao.
