# TODO: Fixed Assets Management (SPEC-021)

> Plan: `tasks/021-fixed-assets-plan.md` · Spec: `docs/specs/021-fixed-assets-management.md`

## Phase 1 — Foundation
- [x] 1.1 Shared types `asset.ts` (enums + DTO + request shapes) + export ở `types/index.ts`
- [x] 1.2 Prisma: 4 models + 3 enums + back-relations Tenant/Employee → `migrate dev --name fixed_assets`
- [x] 1.3 RBAC: `assets:*` vào `PERMISSION_CATALOG` + grants HR_MANAGER/MANAGER/EMPLOYEE → re-seed

### ✅ Checkpoint: Foundation — DONE (9 perms seeded, migration applied, typecheck pass)

## Phase 2 — Cấu hình loại tài sản (AssetCategory)
- [x] 2.1 BE: Category CRUD (GET view; POST/PATCH/DELETE configure; DELETE 409 nếu đang dùng) + đăng ký routes v1
- [x] 2.2 FE: scaffold feature + `AssetCategorySettings` + `AssetSettingsPage` + route `/settings/assets` + nav + i18n
- [x] 2.T Integration tests: CRUD · delete-in-use 409 · EMPLOYEE write 403 · tenant isolation (10/10 pass)

### ✅ Checkpoint: Category config (UI chạy thật, RBAC end-to-end)

## Phase 3 — Asset catalog CRUD
- [x] 3.1 BE: Asset CRUD + list (filter/sort/paginate) + detail; DELETE 409 nếu có history
- [x] 3.2 FE: `AssetTable` + `AssetForm` (Sheet) + `AssetsPage` (management) + `AssetStatusBadge` + nav "Tài sản" + route
- [x] 3.3 FE: `AssetDetailPage` (tab Thông tin) + `GET /assets/:id`
- [x] 3.T Integration tests: CRUD · list filter · delete-block · 422 · tenant isolation (17/17 pass)

### ✅ Checkpoint: Catalog complete (screenshot list dark+light)

## Phase 4 — Cấp phát/Thu hồi + Self-service (RISK CAO)
- [x] 4.1 BE: `asset-state.helper` + assign/return trong `$transaction` (bất biến 1 ACTIVE; 409 transition sai)
- [x] 4.2 FE: `AssignAssetSheet` + `ReturnAssetSheet` + tab "Lịch sử cấp phát" + cột người-giữ ở table
- [x] 4.3 BE: `GET /assets/mine` (self-service) + FE `AssetsPage` adaptive + `MyAssetsView`
- [x] 4.T Integration tests: assign/return · double-assign 409 · `/mine` scoping · EMPLOYEE write 403 (12/12 pass)

### ✅ Checkpoint: Assignment complete (screenshot assign sheet + my-assets)

## Phase 5 — Bảo trì + Thanh lý
- [x] 5.1 BE: maintenance start/complete (409 nếu ASSIGNED) + dispose (terminal, 409 nếu ASSIGNED)
- [x] 5.2 FE: `MaintenanceSheet` + tab "Bảo trì" (list + tổng chi phí) + `DisposeDialog` + badges
- [x] 5.T Integration tests: maintenance start/complete · dispose terminal · 409 guards

### ✅ Checkpoint: Feature complete (vòng đời đầy đủ chạy thật)

## Phase 6 — Polish & verify
- [x] 6.1 FE unit: AssetsPage adaptive · AssetForm validation · Sidebar permission gating
- [x] 6.2 A11y + responsive (768–1440) + dark/light + reduced-motion
- [x] 6.3 i18n sweep vi/en + `/review` five-axis
- [x] 6.4 `GET /assets/export` CSV (BE `assets:export`, tenant-scoped, reuse list filters) + nút "Xuất CSV" trong toolbar quản lý (gated `<Can assets:export>`)

### ✅ Checkpoint: Ship-ready (typecheck+lint+test xanh, screenshots, review pass)
