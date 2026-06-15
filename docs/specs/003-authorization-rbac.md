# SPEC-003: Authorization & Permission Management (RBAC)

**Status:** Draft
**Created:** 2026-05-30
**Author:** Claude + Hạnh
**Depends on:** SPEC-001 (Auth), SPEC-002 (Employee Management)

---

## Objective

Replace the current proto-stage authorization (a static 4-value role enum with scattered `authorize(...roles)` middleware) with a **configurable, database-driven RBAC** system. Tenant admins can create custom roles and configure exactly what each role may do — per screen, per action — through an intuitive permission-matrix UI. Server-side enforcement is the source of truth; the frontend mirrors permissions only for UX (hiding controls the user can't use).

## Target Users

| User | Actions |
|------|---------|
| **Super Admin** | Manage all roles & permissions in tenant; implicitly has every permission |
| **HR Manager** | Granted permissions per configured role; may manage roles if given `roles:*` |
| **Manager / Employee / custom roles** | Whatever the tenant admin grants via the matrix |

The key new persona is the **tenant admin configuring permissions** — the matrix UI must be understandable without training.

---

## Decisions locked in Discovery (2026-05-30)

1. **Role model:** Tenant-customizable. `Role` becomes a DB entity. The 4 system roles (`SUPER_ADMIN`, `HR_MANAGER`, `MANAGER`, `EMPLOYEE`) are seeded per tenant and **locked** (cannot be deleted/renamed); tenants may **create custom roles**. Requires migrating `User.role` enum → `User.roleId` FK.
2. **Data scope (row-level, e.g. "Manager sees only own team"):** **Phase 2.** v1 enforces **module × action** only.
3. **Granularity:** **Action-level** — `view / create / update / delete` plus resource-specific special actions (`employees:terminate`, `leave:approve`, `payroll:process`, `export`).
4. **First delivery:** **Vertical slice** — full RBAC infrastructure + Roles-management matrix UI + the **Employees** module wired end-to-end. Other modules' enforcement follows in later slices (their permission keys are seeded from day one so they already appear in the matrix).

---

## Permission Model

A permission is a string key `resource:action`. The **catalog is global** (same keys for every tenant); only the **Role → Permission mapping is per-tenant**.

### Seeded catalog (v1)

| Resource (screen/module) | Actions |
|--------------------------|---------|
| `dashboard` | `view` |
| `employees` | `view, create, update, delete, activate, deactivate, terminate, export` |
| `departments` | `view, create, update, delete` |
| `positions` | `view, create, update, delete` |
| `timesheet` | `view, create, update, approve` *(module coming soon — keys seeded, screen gated)* |
| `leave` | `view, create, update, approve` *(coming soon)* |
| `payroll` | `view, process, export` *(coming soon)* |
| `users` | `view, create, update, delete` *(system users + role assignment)* |
| `roles` | `view, create, update, delete` *(the permission config itself)* |
| `settings` | `view, update` |

`SUPER_ADMIN` is treated as a wildcard (implicitly holds every permission) — it is never possible to lock yourself out of role management.

---

## Core Features

### 1. Permission catalog & data model
**Acceptance Criteria:**
- [ ] `Permission` table seeded with the catalog above (idempotent seed).
- [ ] `Role` table, tenant-scoped, `@@unique([tenantId, key])`, `isSystem` flag.
- [ ] `RolePermission` junction (roleId, permissionId).
- [ ] `User.roleId` FK added; migration backfills the 4 system roles per tenant and maps each user's existing enum to its system role.
- [ ] System roles get sensible default permission sets on seed (mirrors today's behaviour: HR_MANAGER ≈ full HR CRUD, MANAGER ≈ read, EMPLOYEE ≈ self/dashboard).

### 2. Permission resolution & caching
**Acceptance Criteria:**
- [ ] Resolve `roleId` → `Set<permissionKey>` (join through RolePermission).
- [ ] Cache per role in Redis `hrm:v1:role:{roleId}:perms` (TTL 1h); cache-aside.
- [ ] Cache invalidated whenever a role's permissions change.
- [ ] JWT stays lightweight (`sub, email, tenantId, roleId`) — permissions are NOT embedded in the token (they change; resolved server-side per request from cache).

### 3. Backend enforcement
**Acceptance Criteria:**
- [ ] New `requirePermission(...keys)` middleware: 403 unless the resolved set contains every key.
- [ ] `SUPER_ADMIN` bypasses (implicit all).
- [ ] All Employee routes migrated from `isHROrAdmin` → `requirePermission('employees:<action>')`.
- [ ] `authorize(...roles)` kept only until all routes migrate; not used for new code.

### 4. Roles & Permissions API
**Acceptance Criteria:**
- [ ] `GET /api/v1/permissions` — catalog grouped by resource (for the matrix).
- [ ] `GET /api/v1/roles` — tenant roles + permission counts + user counts.
- [ ] `GET /api/v1/roles/:id` — role with its permission keys.
- [ ] `POST /api/v1/roles` — create custom role.
- [ ] `PATCH /api/v1/roles/:id` — rename/describe + replace permission set (matrix save).
- [ ] `DELETE /api/v1/roles/:id` — blocked if `isSystem` or any user is assigned.
- [ ] All gated by `requirePermission('roles:<action>')`.

### 5. Frontend permission layer
**Acceptance Criteria:**
- [ ] `GET /me` (and login) returns `permissions: string[]` + `roleId`; stored in `useAuthStore`; `DEV_MOCK_USER` updated with a permission set.
- [ ] `usePermission()` → `can(key)` (true for SUPER_ADMIN or if key present).
- [ ] `<Can permission="...">` wrapper component for conditional UI.
- [ ] `<RequirePermission permission="...">` route guard → renders a **403 page** (no silent redirect, per CLAUDE.md).
- [ ] Sidebar filters nav items by each module's `:view` permission.
- [ ] Employees screens hide Add / Edit / Delete / Terminate / Export controls via `can()`.

### 6. Roles management UI (the "easy to configure" deliverable)
Route `/settings/roles`.
**Acceptance Criteria:**
- [ ] Left: role list (system roles badged & locked, custom roles editable); "Create role" action.
- [ ] Right: permission **matrix** — rows grouped by resource (with module icon + label), columns = actions; checkboxes.
- [ ] Convenience toggles: whole-row (all actions of a resource) and whole-column (an action across resources).
- [ ] System roles shown read-only with a clear "Vai trò hệ thống" badge.
- [ ] Create / rename / delete custom role (delete blocked when users assigned — show count).
- [ ] Save → `PATCH` → success toast + query invalidation; optimistic update.
- [ ] Fully i18n (new namespace `roles`, vi + en); `tabular-nums` for counts; WCAG 2.2 AA; skeleton on load; Sheet for create/rename, AlertDialog for delete.

---

## Out of Scope (v1)

- Row-level **data scope** (OWN / TEAM / ALL) — **Phase 2**.
- Per-field permissions.
- Real CRUD enforcement for not-yet-built modules (timesheet/leave/payroll) — keys seeded & screens gated, but those modules have no functionality yet.
- **Audit log** of permission changes — Phase 2.
- Role hierarchy / inheritance, delegated administration — Phase 2.
- Bulk user→role reassignment UI (basic single assignment may land in a later slice, not v1).

---

## Technical Approach

### Data models (Prisma — `apps/api/prisma/schema.prisma`)
```prisma
model Role {
  id          String   @id @default(cuid())
  tenantId    String   @map("tenant_id")
  key         String                          // "hr_manager", "accountant"
  name        String
  description String?
  isSystem    Boolean  @default(false) @map("is_system")
  createdAt   DateTime @default(now())        @map("created_at")
  updatedAt   DateTime @updatedAt             @map("updated_at")
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  users       User[]
  permissions RolePermission[]
  @@unique([tenantId, key])
  @@map("roles")
}

model Permission {
  id       String           @id @default(cuid())
  key      String           @unique           // "employees:create"
  resource String
  action   String
  roles    RolePermission[]
  @@map("permissions")
}

model RolePermission {
  roleId       String     @map("role_id")
  permissionId String     @map("permission_id")
  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  @@id([roleId, permissionId])
  @@map("role_permissions")
}

// User: add roleId FK; keep `role` enum readable during transition (roleId is authoritative for permissions)
```

### API contract shape
- Responses follow the project envelope (`{ success, data }` / paginated form).
- `permissions` catalog grouped: `[{ resource, actions: [{ key, action }] }]`.

### Integration points
- `apps/api/src/app/middlewares/authorize.middleware.ts` → add `requirePermission`.
- `packages/shared` → `Permission`, `RoleDto`, permission key constants (single source for FE+BE).
- `apps/web/src/stores/auth.store.ts`, `lib/api-client` (`/me`), router guards, Sidebar.

### Code Style
- Follow `.claude/rules/*` and CLAUDE.md design system. No hardcoded hex / inline styles. i18n all strings. `cn()` for classes. TanStack Query + optimistic mutations. Zod validation on both client and server.

---

## Testing Strategy

- **Unit (backend):** permission resolution; `requirePermission` allow/deny + SUPER_ADMIN bypass; role service guards (no delete of system role / role-with-users); cache invalidation.
- **Integration (supertest):** employee routes 403 without permission / 200 with; roles CRUD endpoints.
- **Unit (frontend, vitest+RTL):** `usePermission`, `<Can>`, sidebar filtering, matrix editor toggles (row/column), RolesPage render + save call, 403 page.
- Coverage ≥ 80%. Bug fixes get regression tests (Prove-It).

---

## Boundaries

### Always Do
- Enforce on the **server** — client `can()` is UX only.
- Invalidate the Redis permission cache on every role-permission change.
- Keep SUPER_ADMIN un-lockout-able (implicit all permissions).
- i18n every string; follow the design system.

### Ask First
- Dropping the `User.role` enum column (after roleId proven in production).
- Any destructive or non-reversible migration.
- Adding a brand-new third-party authz dependency (e.g. CASL) instead of the in-house resolver.

### Never Do
- Trust permission claims coming from the client.
- Embed mutable permission lists inside the JWT.
- Provide any path for a user to escalate their own permissions.
- Log tokens / PII.

---

## Next Step

After approval, run `/plan` to decompose into vertical slices (suggested: ① data model + seed + migration → ② resolution + cache + `requirePermission` + employee routes → ③ `/me` permissions + shared types → ④ FE permission layer (usePermission/Can/guard/sidebar/403) → ⑤ Roles matrix UI).
