# TODO: SPEC-003 Authorization (RBAC)

## Slice 1: Data model + seed + migration
- [x] 1.1 Add `Permission`, `Role`, `RolePermission` models + `User.roleId` FK (additive/nullable) to schema.prisma
- [x] 1.2 `prisma migrate dev` — additive migration (baselined existing db-push schema as `0_init`, then additive `add_rbac_models`; no data loss)
- [x] 1.3 Seed permission catalog (idempotent upsert by key) — 38 keys
- [x] 1.4 Seed 4 system roles per tenant (isSystem) + default permission mappings (super_admin=38, hr_manager=28, manager=9, employee=6)
- [x] 1.5 Backfill every existing User.roleId from its enum role — 7/7 users
- [x] 1.6 Verify: clean migrate+seed (idempotent re-run stable), roles/mappings present, all users have roleId; api suite 32/32 green

## Slice 2: Resolution + cache + requirePermission + employee routes
- [x] 2.1 `permission.service`: getPermissionsForRole(roleId) + Redis cache-aside (TTL 1h, graceful fallback) + invalidate
- [x] 2.2 Add `roleId` to JwtPayload (sign+verify) and login token build
- [x] 2.3 `requirePermission(...keys)` middleware — SUPER_ADMIN enum bypass (un-lockout), denies when roleId missing or key absent
- [x] 2.4 Migrate employee.routes.ts → requirePermission('employees:*') on all 7 routes
- [x] 2.5 Tests: 6 service unit (cache hit/miss + Redis fallback), 5 middleware unit (bypass/allow/deny/no-roleId), 2 supertest 403/200 → 45/45 green
- [x] Refactor: extracted shared `src/domain/rbac/catalog.ts` (catalog + seedPermissionCatalog + syncSystemRolesForTenant); seed.ts + tests import it (DRY). Seed re-verified: 7/7 roleId, perms 38/28/9/6, catalog 38.

## Slice 3: /me permissions + shared types
- [x] 3.1 Shared `types/rbac.ts`: PERMISSION_CATALOG (single source) + derived `PermissionKey` union + `PERMISSION_KEYS` + `PermissionDto`/`RoleDto`; extended UserDto (roleId, permissions). API catalog.ts now imports PERMISSION_KEYS from @hrm/shared (DRY across packages).
- [x] 3.2 auth.service `userToDto` async: resolves `permissions[]` (SUPER_ADMIN=all keys, others via permissionService) + `roleId`; login/register/getMe all return them.
- [x] 3.3 Verify: GET /me returns roleId + permissions (integration test asserts HR_MANAGER has employees:create + dashboard:view, NOT payroll:process). Typecheck shared+api+web all clean. 46/46 tests green. Seed re-verified.

## ── Checkpoint A: backend RBAC complete ──

## Slice 4: Frontend permission layer
- [x] 4.1 auth.store: roleId + permissions; update DEV_MOCK_USER
- [x] 4.2 usePermission() → can(key)
- [x] 4.3 <Can permission> component
- [x] 4.4 <RequirePermission> route guard + 403 page (i18n, design system)
- [x] 4.5 Sidebar filters by <module>:view
- [x] 4.6 Employees screens: guard Add/Edit/Delete/Terminate/Export
- [x] 4.7 Tests (usePermission, Can, sidebar, 403) + live check + typecheck

## Slice 5: Roles matrix management UI
- [x] 5.1 Backend roles routes/controller/service (list/get/create/update-matrix/delete guards) + cache invalidate
- [x] 5.2 GET /permissions catalog endpoint
- [x] 5.3 FE query hooks for permissions + roles CRUD
- [x] 5.4 /settings/roles page: role list (system locked/badged) + permission matrix (row/col toggles)
- [x] 5.5 Create role (Sheet) + delete (AlertDialog, blocked if users assigned) + optimistic save + toast
- [x] 5.6 i18n `roles` namespace (vi+en); register route + gated sidebar entry
- [x] 5.7 Tests (BE roles guards; FE matrix/save/render) + live e2e + full suite + typecheck

## ── Checkpoint B: first shippable delivery ──
- [x] Admin matrix edit takes effect e2e for Employees (BE-enforced + FE-reflected)
- [x] Full suite green (87/87), EN/VI live-verified  (coverage tool @vitest/coverage-v8 not installed — numeric % pending user approval to add)
- [x] /review (five-axis) passed

### Fix ngoài kế hoạch (phát hiện khi verify)
- [x] api-client.ts: chặn vòng lặp refresh vô hạn khi `/auth/refresh` trả 401 (guard `isRefreshCall`) + regression test
