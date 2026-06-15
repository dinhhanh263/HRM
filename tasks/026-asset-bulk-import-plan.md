# PLAN-026: Asset Bulk Import — Implementation Plan

**Spec:** `docs/specs/026-asset-bulk-import.md`
**Created:** 2026-06-07
**Approach:** Mirror the employee bulk-import pattern (`apps/api/src/domain/employee-import/*`, `apps/web/.../EmployeeImportWizard.tsx`) but **synchronous + atomic** — no BullMQ queue, no invite email, no background job/polling.

---

## Confirmed decisions (from /spec)
- **Category không tồn tại → báo lỗi** (`IMPORT_CATEGORY_NOT_FOUND`), no auto-create.
- **Owner column** (email hoặc mã NV) tùy chọn → tạo `AssetAssignment` (ASSIGNED) trong transaction.
- **Max 2.000 dòng / lần** (atomic transaction bounded).
- **Commit atomic**: một `prisma.$transaction` — tất-cả-hoặc-không; nút Import disabled khi còn lỗi.
- **Permission mới `assets:import`** cho SUPER_ADMIN (wildcard) + HR_MANAGER.

---

## Codebase findings (grounding)

| Concern | Reference (reuse / mirror) |
|---------|----------------------------|
| Upload middleware | `apps/api/src/app/middlewares/upload.middleware.ts` — `uploadImportFile()` reusable as-is (multer memory, 5MB, mime filter) |
| Parser | `employee-import.parser.ts` (ExcelJS xlsx + csv, header alias/normalize). Asset needs its own column set → **new** `asset-import.parser.ts` modeled on it (no premature shared abstraction) |
| Template builder | `employee-import.template.ts` (xlsx dropdowns + guidance sheet + csv BOM) → **new** `asset-import.template.ts` |
| Validate (dry-run) | `employee-import.validate.service.ts` (parse → pure row validation → batched DB checks → stage in Redis) → **new** `asset-import.validate.service.ts` |
| Staging | `employee-import.staging.ts` + `import.config.ts` (Redis key, TTL). Add asset staging (separate key prefix) + `ASSET_IMPORT_MAX_ROWS=2000` |
| Confirm | Employee uses queue; **asset replaces with synchronous `prisma.$transaction`** in a new `asset-import.service.ts` |
| Controller/routes | `employee-import.controller.ts`; asset routes in `asset.routes.ts` — **import routes must precede `GET '/:id'`** to avoid id capture |
| RBAC | `packages/shared/src/types/rbac.ts` (catalog), `apps/api/src/domain/rbac/catalog.ts` (HR_MANAGER grant). `employees:import` is the fully-wired precedent |
| Asset create/assign | `asset.service.ts` `create()` + `assign()` + `asset-state.helper.ts` — replicate insert + assignment logic inside the transaction |
| Frontend wizard | `EmployeeImportWizard.tsx` + `useEmployeeImport.ts` + `useImportTemplate.ts` + `i18n/locales/{vi,en}/employeeImport.json` → mirror as asset variants (drop the progress-polling step) |
| Toolbar gating | `AssetsPage.tsx` MANAGEMENT_PERMISSIONS + `<Can>` / `usePermission().can('assets:import')` |
| Asset model | `assetCode` unique per tenant (`@@unique([tenantId, assetCode])`); category required; owner via `AssetAssignment` |

**Key divergence from employee import:** confirm step is a single blocking transaction (atomic), not an enqueue+poll. The frontend wizard has **5 steps** (template → upload → preview → confirm → result), no progress bar.

---

## Vertical slices (ordered)

### Phase 1 — Foundation (shared contracts + RBAC)

**Task 1.1 — RBAC: `assets:import` end-to-end**
- `packages/shared/src/types/rbac.ts`: add `'import'` to `assets` array in `PERMISSION_CATALOG`.
- `apps/api/src/domain/rbac/catalog.ts`: add `'assets:import'` to HR_MANAGER `permissions`.
- Verify `seedPermissionCatalog` + `syncSystemRolesForTenant` pick it up (idempotent re-sync).
- Outcome: backend can guard with `requirePermission('assets:import')`; frontend `can('assets:import')` resolves.

**Task 1.2 — Shared asset-import types**
- New `packages/shared/src/types/asset-import.ts`: `ASSET_IMPORT_COLUMNS`, `ASSET_IMPORT_COLUMN_LABELS` (vi/en), `REQUIRED_ASSET_IMPORT_COLUMNS`, `ASSET_IMPORT_ENUM_OPTIONS` (condition), `ASSET_IMPORT_ERROR_CODES`, DTOs: `ParsedAssetImportRow`, `ValidatedAssetImportRow`, `AssetImportRowError`, `AssetImportValidationSummary`, `StagedAssetImport`.
- Export from `packages/shared/src/index.ts`.

#### ✅ Checkpoint A — contracts compile
- [ ] `pnpm --filter @hrm/shared build` (or typecheck) green; permission key union includes `assets:import`.

---

### Phase 2 — Backend (template → validate → atomic import)

**Task 2.1 — Template download**
- New `asset-import.template.ts` (xlsx: header + 2 example rows + condition dropdown + guidance sheet listing tenant category codes is optional — keep static enum dropdowns; csv with UTF-8 BOM).
- New `asset-import.controller.ts` `template()`; route `GET /assets/import/template?format=&lang=` (before `/:id`), gated `assets:import`.
- Verify: download xlsx + csv open correctly, vi/en headers.

**Task 2.2 — Validate (dry-run, no DB writes)**
- New `asset-import.parser.ts` (mirror employee parser for the asset columns).
- New `asset-import.validator.ts` (pure per-row: required, `assetCode` regex, `condition` enum, date format, cost number, `assignedAt` required-if-owner; in-file `assetCode` dedupe).
- New `asset-import.validate.service.ts`: parse → cap 2000 → pure validate → batched DB checks (assetCode exists vs DB; category code resolve; owner resolve by email/employeeCode within tenant) → return `AssetImportValidationSummary { importId, totalRows, validCount, errorCount, rows[] }` → stage valid rows in Redis. **Writes nothing.**
- Repo additions: `existingAssetCodes(tenantId, codes)`, category-by-code map, employee-by-email/code map (reuse `employeeRepository`/`asset-category.repository`).
- Add asset staging helper + config (`ASSET_IMPORT_MAX_ROWS=2000`, asset staging key prefix, reuse TTL).
- Controller `validate()` + route `POST /assets/import/validate` (multipart, `uploadImportFile()`), gated `assets:import`.
- Verify: file with deliberate errors returns per-row codes; DB row counts unchanged.

**Task 2.3 — Confirm atomic import**
- New `asset-import.service.ts` `confirmImport(tenantId, importId)`:
  - Load staged rows (tenant + expiry guard); 409 if missing.
  - **Re-validate** assetCode uniqueness vs DB (race guard).
  - `db.$transaction(async (tx) => { for each row: create Asset; if owner → create AssetAssignment(ASSIGNED, ackStatus PENDING) + set asset.status=ASSIGNED })`. Any throw → full rollback.
  - On success: discard staged import; return `{ created, assignmentsCreated }`.
- Controller `confirm()` + route `POST /assets/import` (`{ importId }`), gated `assets:import`.
- Verify: happy path creates N assets + K assignments; injected duplicate → 409 + 0 assets created.

#### ✅ Checkpoint B — backend complete
- [ ] Integration: validate (no write), import happy path, atomic rollback, RBAC 403 (EMPLOYEE/MANAGER), tenant isolation.
- [ ] `pnpm --filter @hrm/api test` green; typecheck/lint clean.

---

### Phase 3 — Frontend (import wizard)

**Task 3.1 — Asset Import Wizard + toolbar**
- Hooks `apps/web/src/features/assets/hooks/useAssetImport.ts`: `useAssetImportTemplate()`, `useValidateAssetImport()`, `useConfirmAssetImport()` (mirror employee hooks; drop polling).
- Component `AssetImportWizard.tsx` (Sheet, 5 steps): (1) download template (xlsx/csv + lang) → (2) upload → (3) **preview table** with "Hợp lệ: N / Lỗi: M", per-row error column+message, **Import disabled when M>0** → (4) confirm → (5) result summary ("đã tạo N tài sản, K bàn giao").
- `AssetsPage.tsx` toolbar: "Import" button wrapped in `<Can permission="assets:import">`; add `assets:import` to MANAGEMENT_PERMISSIONS so management view shows for import-only users.
- On success: `toast.success` + invalidate `assetKeys.lists()`; close wizard.
- i18n: new `i18n/locales/{vi,en}/assetImport.json`; register namespace.
- Design tokens only; light+dark; skeleton/empty/error.

#### ✅ Checkpoint C — feature works in browser
- [ ] Manual (preview tools): upload error file → see error table + disabled Import; fix → confirm → list grows by N; dark mode + vi/en OK.

---

### Phase 4 — Tests & polish

**Task 4.1 — Unit tests** (validator each error code; parser xlsx+csv; category/owner resolution; in-file dedupe; 2000-row cap).

**Task 4.2 — Integration tests** (already drafted at Checkpoint B — finalize: idempotency note N/A since create-only with unique code; assert `assets:import` 403 for non-granted roles).

**Task 4.3 — E2E (Playwright)**: download template → upload bad file → error table + disabled Import → upload good file → confirm → summary + assert asset list count increased by N.

#### ✅ Checkpoint D — ship-ready
- [ ] All tests green; coverage of critical paths; `/review` five-axis; manual vi/en + dark.

---

## Risks / watch-outs
- **Route ordering:** `/import`, `/import/template`, `/import/validate` MUST be registered before `GET '/:id'` in `asset.routes.ts`.
- **Transaction size:** 2.000 inserts in one interactive transaction — set a sufficient transaction timeout; if confirm proves slow, batch `createMany` for assets then `createMany` for assignments inside the same `$transaction` (still atomic) rather than per-row awaits.
- **assetCode normalization:** uppercase + trim before dedupe and DB compare, consistent with `createAssetSchema` regex.
- **Owner status:** default to allowing only ACTIVE employees as owner unless decided otherwise (Spec Open Q #3) — confirm in /build.
- **Don't over-abstract:** keep asset parser/template standalone (mirror, don't refactor employee import into a shared lib in this iteration).

## Open questions carried into /build
1. Owner must be ACTIVE? (default: yes)
2. Allow a `status` column in template, or always AVAILABLE/ASSIGNED? (default: no status column)
3. Per-row `createMany` vs loop inside transaction (perf) — decide once measured.
