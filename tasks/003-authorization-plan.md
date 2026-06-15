# Plan: SPEC-003 Authorization & Permission Management (RBAC)

**Spec:** `docs/specs/003-authorization-rbac.md`
**Created:** 2026-05-30

---

## Context & grounding (from codebase survey)

- **Schema:** `apps/api/prisma/schema.prisma` — `User.role` is `UserRole` enum; multi-tenant (`tenantId` everywhere); no permission tables. Seed is idempotent (`upsert`) at `apps/api/prisma/seed.ts` (`db:seed` = `tsx prisma/seed.ts`).
- **JWT:** `apps/api/src/shared/helpers/jwt.helper.ts` — `JwtPayload = { sub, email, role, tenantId }`. Need to add `roleId`.
- **Token/me build:** `apps/api/src/domain/services/auth.service.ts` (`getMe`, login response builds user DTO + `jwtPayload`).
- **Auth middleware:** `apps/api/src/app/middlewares/auth.middleware.ts` (`authenticate`), `authorize.middleware.ts` (`authorize`, `isHROrAdmin`, `isAdmin`).
- **Routes:** `apps/api/src/app/routes/v1/{auth,employee,department,position}.routes.ts` — employee routes currently use `isHROrAdmin` / role lists.
- **Shared:** `packages/shared/src/types/` (`user.ts` has `UserRole`, `UserDto`; `auth.ts` has `AuthResponse`); barrel `index.ts`.
- **FE auth:** `apps/web/src/stores/auth.store.ts` (`UserDto`, `DEV_MOCK_USER` role HR_MANAGER), token in-memory in `lib/api-client.ts`.
- **FE routing/guards:** `apps/web/src/router.tsx`, `components/auth/ProtectedRoute.tsx` (auth-only). No `usePermission`. Sidebar `components/layout/Sidebar.tsx` shows all items unconditionally.
- **i18n:** namespaces per feature under `apps/web/src/i18n/locales/{vi,en}`; statically imported in the i18n init. Need new `roles` namespace.

## Architecture decisions (locked in /spec Discovery)
Custom roles per tenant · data scope = Phase 2 · action-level granularity · vertical-slice delivery (infra + Roles UI + Employees e2e first).

## Risk-first notes
- **Highest risk = the migration** (`User.role` enum → `roleId` FK with backfill). De-risk in Slice 1 with a non-destructive additive migration: add `roleId` nullable, seed roles, backfill, keep enum column. Verify on a fresh `db:push`/migrate + seed before building on top.
- **Cross-cutting**: authz touches BE middleware + JWT + shared types + FE store + guards. Slices 1–3 are unavoidably foundational; first *visible* value lands at Slice 4–5.
- **Lockout risk**: SUPER_ADMIN must be implicit-all so role-matrix edits can never remove access to `/settings/roles`.

---

## Vertical slices

### Slice 1 — Data model, seed catalog, migration  *(foundation)*
DB-only but independently verifiable (migrate + seed + studio inspection).
- `Permission`, `Role`, `RolePermission` models; `User.roleId` FK (nullable, additive).
- Seed: permission catalog (idempotent upsert by `key`); per-tenant 4 system roles (`isSystem`); default permission mapping per system role; backfill each user's `roleId` from existing enum.
- **Verify:** `prisma migrate dev` + `db:seed` run clean; Studio shows roles+mappings; every existing user has `roleId`.

### Slice 2 — Resolution, cache, `requirePermission`, migrate employee routes
- `permission.service` (or `rbac.service`): `getPermissionsForRole(roleId)` → `Set<string>`, Redis cache-aside `hrm:v1:role:{roleId}:perms` (TTL 1h) + `invalidateRolePermissions(roleId)`. SUPER_ADMIN ⇒ all.
- Add `roleId` to `JwtPayload` (sign + verify) and to login token build.
- `requirePermission(...keys)` middleware in `authorize.middleware.ts`.
- Migrate `employee.routes.ts` from `isHROrAdmin` → `requirePermission('employees:<action>')`.
- **Verify:** unit tests (resolution, middleware allow/deny, SUPER_ADMIN bypass); supertest employee routes 403/200; typecheck.

### Slice 3 — `/me` + login expose permissions; shared types
- Extend `getMe` + login response: include `roleId` and resolved `permissions: string[]`.
- `packages/shared`: `Permission`/`RoleDto` types, `PERMISSION_KEYS` const (single source FE+BE), extend `UserDto` (`roleId`, `permissions`).
- **Verify:** `GET /me` returns permissions; typecheck across packages.

### Checkpoint A — backend RBAC complete
- [ ] Migration+seed reproducible from clean DB
- [ ] Employee routes enforced by permission, tests green
- [ ] `/me` returns permissions; shared types compile

### Slice 4 — Frontend permission layer
- `auth.store`: store `roleId` + `permissions`; update `DEV_MOCK_USER` (full perms for HR_MANAGER dev).
- `usePermission()` hook → `can(key)` (SUPER_ADMIN or key present).
- `<Can permission>` component; `<RequirePermission permission>` route guard → **403 page** (design-system styled, i18n).
- Sidebar filters items by `<module>:view`.
- Employees screens: guard Add/Edit/Delete/Terminate/Export via `can()`.
- **Verify:** vitest+RTL (usePermission, Can, sidebar filter, 403); live check toggling mock permissions; typecheck.

### Slice 5 — Roles matrix management UI
- API hooks (TanStack Query) for `/permissions` + `/roles` CRUD.
- Backend `roles.routes.ts` + controller + service (list/get/create/update(matrix)/delete with guards: no delete system role / role-with-users) — gated `requirePermission('roles:*')`; invalidate cache on save.
- `/settings/roles` page: role list (system badged/locked) + permission matrix (rows=resources grouped, cols=actions, checkboxes, row/column toggles), create via Sheet, delete via AlertDialog, optimistic save + toast.
- i18n `roles` namespace (vi+en); register route + sidebar entry (gated `roles:view`).
- **Verify:** BE tests (roles CRUD guards); FE tests (matrix toggles, save call, page render); live e2e create role → toggle perms → see Employees UI change; typecheck + full suite.

### Checkpoint B — first shippable delivery
- [ ] Admin configures a role's permissions in the matrix and it takes effect (BE-enforced + FE-reflected) for Employees
- [ ] Coverage ≥ 80%; full suite green; live-verified EN/VI
- [ ] `/review` (five-axis) passed

---

## Out of scope (tracked for later)
Data scope OWN/TEAM/ALL · audit log of permission changes · role hierarchy/inheritance · per-field perms · real CRUD enforcement for timesheet/leave/payroll · bulk user→role reassignment UI · dropping the `User.role` enum column.
