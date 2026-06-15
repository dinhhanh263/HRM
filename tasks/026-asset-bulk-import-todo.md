# TODO-026: Asset Bulk Import

Spec: `docs/specs/026-asset-bulk-import.md` · Plan: `tasks/026-asset-bulk-import-plan.md`

## Phase 1: Foundation
- [x] 1.1 Add `assets:import` to PERMISSION_CATALOG + HR_MANAGER grant (catalog.ts); verify seed idempotent
- [x] 1.2 Shared asset-import types (columns, labels vi/en, enum options, error codes, DTOs) + export

### ✅ Checkpoint A — shared contracts compile (permission union includes `assets:import`) — PASSED

## Phase 2: Backend
- [ ] 2.1 Template download: `asset-import.template.ts` (xlsx+csv) + controller + `GET /assets/import/template` (gated `assets:import`, before `/:id`)
- [ ] 2.2 Validate dry-run: parser + pure validator + validate.service (batched DB checks: assetCode dup, category-by-code, owner-by-email/code) + Redis staging + `POST /assets/import/validate` — writes nothing
- [ ] 2.3 Confirm atomic: `asset-import.service.confirmImport` (re-validate + single `prisma.$transaction`: assets + owner assignments, all-or-nothing) + `POST /assets/import`

### ✅ Checkpoint B — backend (validate no-write, import happy path, atomic rollback, RBAC 403, tenant isolation) green

## Phase 3: Frontend
- [ ] 3.1 `useAssetImport.ts` hooks + `AssetImportWizard.tsx` (5 steps, preview table, Import disabled on errors) + toolbar `<Can assets:import>` + `assetImport.json` i18n vi/en

### ✅ Checkpoint C — works in browser (error table → disabled Import → confirm → list +N; dark + vi/en)

## Phase 4: Tests & polish
- [ ] 4.1 Unit: validator (each code), parser xlsx+csv, category/owner resolution, in-file dedupe, 2000 cap
- [ ] 4.2 Integration: validate no-write, import happy, atomic rollback, 403 non-granted, tenant isolation
- [ ] 4.3 E2E Playwright: template → bad file (errors + disabled) → good file → confirm → assert list +N

### ✅ Checkpoint D — ship-ready (tests green, /review, manual vi/en + dark)
