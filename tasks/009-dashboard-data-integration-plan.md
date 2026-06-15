# PLAN-009: Dashboard Data Integration (Role-Based)

**Spec:** `docs/specs/009-dashboard-data-integration.md`
**Created:** 2026-06-01
**Strategy:** Vertical slices. One aggregate endpoint (`GET /api/v1/dashboard`)
grows feature-by-feature; the frontend page consumes it via one `useDashboard()`
hook. Scoping is foundational (built once), widgets layer on top, role-adaptive
layout lands last.

---

## Codebase findings (analysis, read-only)

- **`dashboard:view` already granted** to HR_MANAGER, MANAGER, EMPLOYEE; SUPER_ADMIN
  is wildcard (`apps/api/src/domain/rbac/catalog.ts:33,52,66`). → **No catalog change**,
  only a verification test.
- **Auth context:** `req.user` = `{ sub, tenantId, role, roleId }`. Linked employee
  via `employeeRepository.findByUserId(sub, tenantId)`
  (`apps/api/src/app/controllers/leave.controller.ts:19-21`).
- **Scoping precedent:** leave controller branches by capability and resolves the
  caller's employee — mirror this. Profile-less users (tenant admins) → empty
  personal data, not an error.
- **Layers:** route (`routes/v1/*.routes.ts`) → controller (thin) → service
  (`domain/services/`) → repository (`domain/repositories/`). Mount in
  `routes/index.ts`.
- **Aggregates available:** `db.employee.count` already used
  (`employee.repository.ts:70`); Prisma `groupBy`/`aggregate` available. Team scope
  via `Employee.managerId`. Leave + balance services exist from SPEC-004.
- **DTO home:** `packages/shared/src/types/` + re-export in `index.ts`
  (e.g. add `dashboard.ts`). Consumed as `@hrm/shared` on both ends.
- **Frontend convention:** `features/<x>/api.ts` + `hooks/use<X>.ts` with a query-key
  factory (`features/employees/hooks/useEmployees.ts`). `dashboard/` currently holds
  only `DashboardPage.tsx` + test — needs an `api.ts` + `hooks/`.
- **Widgets removed this iteration:** AttendanceChart, ActivityItem, and their
  `DUMMY_ATTENDANCE_TREND` / `DUMMY_RECENT_ACTIVITIES` (no backend model).

---

## Scope resolver (built once, used by every query)

`dashboard.service` resolves a scope descriptor from `req.user`:

```ts
type DashboardScope =
  | { kind: 'company' }                              // SUPER_ADMIN, HR_MANAGER
  | { kind: 'team'; employeeId: string; memberIds: string[] } // MANAGER (direct reports)
  | { kind: 'self'; employeeId: string };            // EMPLOYEE
```

Every aggregate query takes the scope and constrains `where` accordingly. This is
the security boundary — enforced server-side, never inferred from the client.

---

## Vertical slices

### Phase 1 — Foundation (risk-first, thin end-to-end slice)

**Task 1.1 — Shared `DashboardData` contract**
- *Files:* `packages/shared/src/types/dashboard.ts` (new), `.../types/index.ts`
- DTO per spec (`stats`, `departmentDistribution?`, `pendingLeave`, `myLeaveBalance?`,
  `upcomingEvents`, `role`). Export the scope-agnostic shape.
- *Verify:* `@hrm/shared` builds; type importable from web + api.

**Task 1.2 — Endpoint skeleton + scope resolver + company-wide stats**
- *Files:* `apps/api/src/app/routes/v1/dashboard.routes.ts` (new), `routes/index.ts`,
  `controllers/dashboard.controller.ts` (new), `domain/services/dashboard.service.ts` (new),
  `domain/repositories/dashboard.repository.ts` (new)
- `GET /api/v1/dashboard` → `authenticate` + `requirePermission('dashboard:view')`.
- Implement `resolveDashboardScope` + `stats` block via Prisma `count`
  (`totalActive`, `pendingApprovals`, `onLeaveToday`, `newHiresThisMonth`,
  `terminatedThisMonth`, `departmentCount`). Tenant-scoped. **Company scope only** here.
- *Tests:* integration — 403 without permission; 200 returns stat numbers; tenant
  isolation. Unit — month-boundary + on-leave-today date window.
- *Verify:* `curl`/supertest returns real counts for an HR user.

**Task 1.3 — Frontend data layer + stat cards on real data**
- *Files:* `apps/web/src/features/dashboard/api.ts` (new),
  `hooks/useDashboard.ts` (new), `DashboardPage.tsx`
- `useDashboard()` query (key factory mirroring employees); render the 4 StatCards
  from `data.stats`; remove `DUMMY_STATS` usage. Skeleton on load, error toast/inline.
- *Verify (browser):* stat cards show DB numbers; skeleton + empty/error states work.

> **Checkpoint A:** real stats render end-to-end (HR/Admin); RBAC + tenant scope proven.

---

### Phase 2 — Widgets (each extends the payload + its UI)

**Task 2.1 — Department distribution**
- *Files:* `dashboard.repository.ts`, `dashboard.service.ts`, `DashboardPage.tsx`
  (`DepartmentChart`)
- `employee.groupBy(departmentId)` where `status=ACTIVE` + scope, joined to dept name.
  Client resolves bar **color from theme tokens** (no hex). Remove `DUMMY_DEPARTMENTS`.
- *Tests:* service groupBy shape; chart renders names+counts.

**Task 2.2 — Pending leave requests (display + link)**
- *Files:* service/repo, `DashboardPage.tsx` (`LeaveRequestItem`)
- Top-N `PENDING` requests in scope: employeeName, leaveType {name,colorHex},
  dates, totalDays, createdAt. **No approve/reject** — item links to `/leave`.
  Remove `DUMMY_LEAVE_REQUESTS` + `handleApprove/RejectLeave`.
- *Tests:* list scoped & capped; empty state with link.

**Task 2.3 — Upcoming events (derived, no new model)**
- *Files:* service/repo, `DashboardPage.tsx` (`EventItem`)
- Birthdays (`dateOfBirth` md within 30d), anniversaries (`joinDate` md within 30d,
  ≥1yr), new joiners (`joinDate` within next 30d). Handle Dec→Jan rollover.
  Remove `DUMMY_UPCOMING_EVENTS`.
- *Tests:* unit on date windows incl. year rollover; scope respected.

**Task 2.4 — EMPLOYEE self-service: leave balance + my pending**
- *Files:* service (reuse `leaveBalanceService`), DTO `myLeaveBalance`/`myPendingRequests`,
  `DashboardPage.tsx` (balance cards)
- For `self` scope: current-year balance per type (allocated/used/remaining) +
  `myPendingRequests` count.
- *Tests:* self scope returns own balance only.

> **Checkpoint B:** every surviving widget is backed by real, scoped data.

---

### Phase 3 — Role-adaptive layout + cleanup

**Task 3.1 — Full role scoping + scope test matrix**
- *Files:* `dashboard.service.ts`, service tests
- Finish `team` (MANAGER → `managerId` direct reports) + `self` (EMPLOYEE) branches
  across all queries. Tests: HR=company, MANAGER=team only, EMPLOYEE=self only,
  cross-tenant isolation, profile-less admin = graceful empties.

**Task 3.2 — `DASHBOARD_LAYOUT_BY_ROLE` + remove dead widgets**
- *Files:* `DashboardPage.tsx`, delete `AttendanceChart` + `ActivityItem` code +
  `DUMMY_ATTENDANCE_TREND` + `DUMMY_RECENT_ACTIVITIES`
- Layout map renders the correct widget set per role (spec matrix). Assert **zero
  `DUMMY_*`** remain.

**Task 3.3 — i18n, a11y, polish, tests**
- *Files:* `i18n/locales/{en,vi}/dashboard.json`, `DashboardPage.test.tsx`
- Prune unused keys / add new; `tabular-nums` on numbers; `aria-label` on icon
  buttons; dark-mode + reduced-motion check; rewrite page test for per-role widget
  sets, skeleton/empty/error. Coverage ≥ 80%.

> **Checkpoint C:** all four roles verified in browser (light+dark); suite green; no `DUMMY_*`.

---

## Dependency graph

```
1.1 ─► 1.2 ─► 1.3 ─► [A]
                │
        ┌───────┼───────┬───────┐
       2.1     2.2     2.3     2.4   (parallelizable; all need 1.2/1.3)
        └───────┴───────┴───────┘ ─► [B]
                │
       3.1 (scope) ─► 3.2 (layout) ─► 3.3 (polish) ─► [C]
```

## Risks
- **Scope correctness** is the security-critical part → covered by 3.1 test matrix;
  resolver built in 1.2 so widgets inherit it.
- **Event date math** (year rollover, leap-day) → dedicated unit tests in 2.3.
- **Profile-less users** (tenant admins with no Employee row) → return empty
  self-data, mirror leave controller behavior.

## Out of scope (per spec)
Attendance rate/trend, activity feed, SUPER_ADMIN tenant/billing widgets, Redis
caching, draggable widgets.

## Next: `/build` (start at Task 1.1, TDD per slice).
