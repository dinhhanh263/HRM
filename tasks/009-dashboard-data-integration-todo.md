# TODO-009: Dashboard Data Integration (Role-Based)

> Plan: `tasks/009-dashboard-data-integration-plan.md` · Spec: `docs/specs/009-dashboard-data-integration.md`

## Phase 1: Foundation (risk-first, end-to-end)
- [x] 1.1 Shared `DashboardData` DTO in `packages/shared/src/types/dashboard.ts` + export in `index.ts`
- [x] 1.2 Endpoint skeleton + scope resolver + company-wide `stats` (route, controller, service, repo); RBAC `dashboard:view` + tenant scope; integration + unit tests
- [x] 1.3 Frontend `api.ts` + `useDashboard()` hook; stat cards on real data; remove `DUMMY_STATS`; skeleton/error states

## ⛳ Checkpoint A: real stats render end-to-end (HR/Admin); RBAC + tenant scope proven

## Phase 2: Widgets (vertical slices)
- [x] 2.1 Department distribution — `groupBy(departmentId)`; chart real data; colors from theme tokens; remove `DUMMY_DEPARTMENTS`
- [x] 2.2 Pending leave requests — scoped top-N, display + link to `/leave` (no approve/reject); remove `DUMMY_LEAVE_REQUESTS` + handlers
- [x] 2.3 Upcoming events — derived birthdays/anniversaries/new-joiners (30d window, Dec→Jan rollover); remove `DUMMY_UPCOMING_EVENTS`
- [x] 2.4 EMPLOYEE self-service — leave balance cards + `myPendingRequests` (reuse `leaveBalanceService`)

## ⛳ Checkpoint B: every surviving widget backed by real, scoped data

## Phase 3: Role-adaptive layout + cleanup
- [x] 3.1 Finish role scoping (MANAGER=team via `managerId`, EMPLOYEE=self) + scope test matrix (company/team/self, tenant isolation, profile-less admin)
- [x] 3.2 `DASHBOARD_LAYOUT_BY_ROLE` map; delete AttendanceChart + ActivityItem + `DUMMY_ATTENDANCE_TREND` + `DUMMY_RECENT_ACTIVITIES`; assert zero `DUMMY_*`
- [x] 3.3 i18n (en+vi) prune/add; `tabular-nums`, `aria-label`, dark-mode + reduced-motion; rewrite `DashboardPage.test.tsx`; coverage ≥ 80%

## ⛳ Checkpoint C: all 4 roles verified in browser (light+dark); suite green; no `DUMMY_*`
