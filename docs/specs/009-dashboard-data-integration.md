# SPEC-009: Dashboard Data Integration (Role-Based)

**Status:** Draft
**Created:** 2026-06-01
**Author:** Claude + Hạnh
**Depends on:** SPEC-002 (Employee Management), SPEC-003 (Authorization/RBAC), SPEC-004 (Leave Management)

---

## Objective

Replace the 100% hardcoded `DUMMY_*` data on the dashboard
(`apps/web/src/features/dashboard/DashboardPage.tsx`) with real, tenant-scoped
data served from a single aggregation endpoint, and make the dashboard
**role-adaptive** — each role lands on the widgets that match what they actually
do (per `.claude/rules/ui-modern.md` §2). Widgets that have no backend data
source yet are removed in this iteration, not faked.

## Target Users

| Role | Default dashboard focus |
|------|-------------------------|
| **SUPER_ADMIN** | Company-wide overview (same surface as HR for now; tenant/billing/health widgets are future work) |
| **HR_MANAGER** | Company-wide overview — headcount, department distribution, all pending approvals, upcoming events |
| **MANAGER** | **Their team first** — team headcount, leave requests awaiting their approval, team upcoming events |
| **EMPLOYEE** | **Self-service** — my leave balance, my pending/recent requests, upcoming team events |

---

## Scope decisions (confirmed)

1. **Role-based** — different widgets/layout per role, not just hidden buttons.
2. **Hide widgets without a backend model** — drop **Attendance rate** stat,
   **Attendance trend** chart, and **Recent Activity** feed. They return when
   `Timesheet`/`AuditLog` models exist (own future spec).
3. **Single aggregate endpoint** — `GET /api/v1/dashboard`, one `useQuery`.
4. **Pending leave = display + link only** — no approve/reject mutation on the
   dashboard; clicking routes to `/leave`. (Avoids duplicating SPEC-004 logic.)

---

## Core Features

### 1. Dashboard aggregation endpoint
**Acceptance Criteria:**
- [ ] `GET /api/v1/dashboard` behind `authenticate` + `requirePermission('dashboard:view')`
- [ ] Returns a single `DashboardData` payload (shape below) in one round-trip
- [ ] All data **tenant-scoped**; all counts via Prisma `count` / `groupBy` (no N+1, no `findMany`-then-count-in-JS)
- [ ] Data is **role-scoped server-side** (not just hidden client-side):
  - HR_MANAGER / SUPER_ADMIN → company-wide
  - MANAGER → only their direct reports (`Employee.managerId = me`) and their team's leave
  - EMPLOYEE → only their own requests + own balance
- [ ] `role` echoed in response so the client picks the layout deterministically

### 2. Employee stats (counts)
**Acceptance Criteria:**
- [ ] `totalActive` = employees with `status = ACTIVE` in scope
- [ ] `onLeaveToday` = employees with an `APPROVED` leave request where today ∈ [startDate, endDate]
- [ ] `pendingApprovals` = `PENDING` leave requests in the viewer's review scope
- [ ] `newHiresThisMonth` = employees with `joinDate` in the current month
- [ ] `terminatedThisMonth` = employees with `terminatedAt` in the current month
- [ ] EMPLOYEE scope: stats reduce to self-relevant (`myPendingRequests` count) — see role matrix

### 3. Department distribution
**Acceptance Criteria:**
- [ ] `Employee.groupBy(departmentId)` where `status = ACTIVE`, joined to department name
- [ ] Each entry: `{ departmentId, name, count }` — **color resolved on the client from theme tokens**, not stored/hardcoded (fixes the old `#4A9EBF` hardcode)
- [ ] Shown to HR/Admin; hidden for EMPLOYEE

### 4. Pending leave requests (display + link)
**Acceptance Criteria:**
- [ ] Up to N (e.g. 5) most recent `PENDING` requests in scope
- [ ] Each: employee name, leave type (name + colorHex from `LeaveType`), date range, totalDays, createdAt
- [ ] No action buttons; whole item links to `/leave`
- [ ] Empty state with copy + link when none

### 5. Leave balance (EMPLOYEE self-service)
**Acceptance Criteria:**
- [ ] For EMPLOYEE: current-year balance per leave type — `allocated`, `used`, `remaining`
- [ ] Sourced from SPEC-004 `LeaveBalance`; reuse existing service, scoped to caller's employee

### 6. Upcoming events (derived, no new model)
**Acceptance Criteria:**
- [ ] **Birthdays** — `dateOfBirth` month/day within next 30 days
- [ ] **Work anniversaries** — `joinDate` month/day within next 30 days (≥1 year)
- [ ] **New joiners** — `joinDate` within the next 30 days (future-dated starts)
- [ ] Each: type, employee name, department, the upcoming date
- [ ] Scope follows role (team for MANAGER, company for HR/EMPLOYEE-as-readonly)

### 7. Role-adaptive frontend
**Acceptance Criteria:**
- [ ] `DashboardPage` reads `useDashboard()` (TanStack Query) — zero `DUMMY_*` left
- [ ] A `DASHBOARD_LAYOUT_BY_ROLE` map decides which widgets render (per matrix)
- [ ] Skeleton loaders on initial load (no full-page spinner); error state via toast/inline
- [ ] Empty states with CTA for every list/section
- [ ] i18n (vi + en), dark mode, WCAG AA, `tabular-nums` for all numbers, no hex colors

---

## Role → widget matrix

| Widget | SUPER_ADMIN | HR_MANAGER | MANAGER | EMPLOYEE |
|--------|:--:|:--:|:--:|:--:|
| Greeting header | ✓ | ✓ | ✓ | ✓ |
| Stat: active employees | company | company | team | — |
| Stat: on leave today | company | company | team | — |
| Stat: pending approvals | company | company | team | my pending |
| Stat: new hires this month | company | company | team | — |
| Department distribution | ✓ | ✓ | — | — |
| Pending leave requests | all | all | team | my requests |
| My leave balance cards | — | — | — | ✓ |
| Upcoming events | company | company | team | company (read) |
| Quick stats footer | ✓ | ✓ | team | — |

> SUPER_ADMIN mirrors HR_MANAGER this iteration; tenant/seat/health widgets are future work.

---

## API

`GET /api/v1/dashboard` — `authenticate` → `requirePermission('dashboard:view')`

**Response `DashboardData` (fields populated per role scope; unused omitted):**
```ts
interface DashboardData {
  role: UserRole;
  stats: {
    totalActive: number;
    onLeaveToday: number;
    pendingApprovals: number;
    newHiresThisMonth: number;
    terminatedThisMonth: number;
    departmentCount: number;
    myPendingRequests?: number;        // EMPLOYEE
  };
  departmentDistribution?: Array<{ departmentId: string; name: string; count: number }>;
  pendingLeave: Array<{
    id: string; employeeName: string;
    leaveType: { name: string; colorHex: string };
    startDate: string; endDate: string; totalDays: number; createdAt: string;
  }>;
  myLeaveBalance?: Array<{ leaveType: { name: string; colorHex: string };
    allocated: number; used: number; remaining: number }>;   // EMPLOYEE
  upcomingEvents: Array<{
    kind: 'birthday' | 'anniversary' | 'new_joiner';
    employeeName: string; department: string | null; date: string;
  }>;
}
```

## Permissions

`dashboard: ['view']` already exists in the shared catalog
(`packages/shared/src/types/rbac.ts`). **Verify & ensure** every role
(SUPER_ADMIN implicit-all, HR_MANAGER, MANAGER, EMPLOYEE) is granted
`dashboard:view` in `apps/api/src/domain/rbac/catalog.ts`; add the grant where
missing. Data scoping by role is enforced **inside** the service, not by the
permission key alone.

## Technical Approach

**Backend** (`apps/api/`)
- `dashboard.controller.ts` (thin) → `dashboard.service.ts` (aggregation logic) → repositories
- Service resolves caller's `employeeId` + `role`, branches scope, runs counts via
  Prisma `count` / `groupBy` / `aggregate`; date-window queries for events
- Route file `routes/v1/dashboard.routes.ts`, mounted in `routes/index.ts`
- DTO in shared package so client/server share the contract

**Frontend** (`apps/web/`)
- New feature `features/dashboard/` data layer: `api.ts` + `hooks/useDashboard.ts`
  (query key factory, mirrors the `employees` convention)
- Refactor `DashboardPage.tsx`: delete `DUMMY_*`, consume `useDashboard()`,
  add `DASHBOARD_LAYOUT_BY_ROLE`, keep existing presentational components
  (StatCard, DepartmentChart, LeaveRequestItem, EventItem) but drop
  AttendanceChart + ActivityItem
- Department/leave colors from theme tokens via a small resolver, never hex literals

## Code Style
- Follow `.claude/rules/` — RBAC server-side ([feedback_rbac-new-screen]), TanStack
  Query (no `fetch` in components), Zod validation, Prisma singleton, i18n keys,
  tenant scoping everywhere.

## Testing Strategy
- **Unit (api):** `dashboard.service` scoping — HR sees company, MANAGER sees only
  team, EMPLOYEE sees only self; stat math (on-leave-today window, month boundaries,
  event date windows incl. year-rollover Dec→Jan)
- **Integration (api):** `GET /dashboard` returns 403 without `dashboard:view`;
  returns correctly scoped payload per role; tenant isolation (no cross-tenant leakage)
- **Unit (web):** `DashboardPage` renders the right widget set per role; skeleton,
  empty, and error states; numbers formatted; no `DUMMY_*` references remain
- Coverage ≥ 80% (project standard)

## Boundaries

### Always Do
- Enforce `dashboard:view` **and** role-based data scoping on the server
- Tenant-scope every query
- Skeleton on load, empty states with CTA, dark-mode + i18n + a11y
- Resolve colors from theme tokens, never hardcode hex

### Ask First
- Adding/altering Prisma models (none expected this iteration)
- Changing role→permission grants beyond adding `dashboard:view`
- Caching dashboard aggregates in Redis (defer unless perf demands it)

### Never Do
- Fake/placeholder data for attendance or activity feed — those widgets are removed, not stubbed
- Approve/reject leave from the dashboard (display + link only)
- Compute role scoping only on the client (security boundary is the server)
- Hex color literals, inline styles, `fetch` inside components, `any`

## Out of Scope (future)
- Attendance/Timesheet model → attendance rate + 7-day trend chart
- AuditLog/event stream → recent activity feed
- SUPER_ADMIN tenant/seat/billing/system-health widgets
- Redis caching of dashboard aggregates; configurable/draggable widgets
- Charts library swap (Recharts) — keep current SVG/bar components

## Non-functional
- Single round-trip; interaction feedback < 100ms; skeleton makes load feel instant
- Aggregates via DB-side `count`/`groupBy` (no over-fetch); add indexes only if measured
- WCAG AA, dark mode, vi + en

---

## Next Step
After approval, run `/plan` to decompose into vertical slices (endpoint + DTO →
service scoping → frontend hook → role layout refactor → tests).
