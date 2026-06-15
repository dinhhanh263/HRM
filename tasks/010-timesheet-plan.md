# Plan: SPEC-010 Timesheet / Chấm công

**Spec:** `docs/specs/010-timesheet.md`
**Created:** 2026-06-02
**Strategy:** Vertical slices after a thin shared foundation. Dependency-ordered,
risk-front-loaded (OT category derivation + summary aggregation are the risky
bits and are tackled with focused unit tests).

## Codebase integration points (surveyed, read-only)

- **API layering mirrors Leave:** `domain/timesheet/*` (service-side helpers,
  defaults, mappers), `domain/repositories/*.repository.ts`,
  `domain/services/*.service.ts`, `app/controllers/timesheet.controller.ts`,
  `app/validators/timesheet.validator.ts`, `app/routes/v1/timesheet.routes.ts`.
- **Route registration:** add `router.use('/timesheet', timesheetRoutes)` in
  `apps/api/src/app/routes/index.ts`.
- **Prisma:** `apps/api/prisma/schema.prisma`; seed in `apps/api/prisma/seed.ts`.
- **RBAC:** `packages/shared/src/types/rbac.ts` (add `timesheet:configure`),
  `apps/api/src/domain/rbac/catalog.ts` (grant to HR/Manager).
- **Shared DTOs:** new `packages/shared/src/types/timesheet.ts`, export in
  `packages/shared/src/types/index.ts`.
- **Web feature mirrors Leave:** `apps/web/src/features/timesheet/{api,hooks,
  components,pages,utils}.*` with a barrel `index.ts`.
- **Web route:** replace the placeholder at `apps/web/src/router.tsx:117`
  (`'timesheet'` → real `TimesheetPage` gated by `RequirePermission timesheet:view`).
- **Nav:** `apps/web/src/components/layout/Sidebar.tsx` already lists Chấm công.
- **i18n:** add `timesheet` namespace under `apps/web/src/i18n/locales/{vi,en}/`.

---

## Phase 0 — Foundation (schema + shared types + RBAC)

### Task 0.1: Prisma models + migration
**Objective:** Persist policy, holidays, attendance, OT.
**Files:** `apps/api/prisma/schema.prisma` (+ migration via `prisma migrate dev`)
**Adds:** `TimesheetPolicy`, `Holiday`, `AttendanceRecord`, `OvertimeRequest`;
enums `OvertimeCategory`, `OvertimeStatus`, `AttendanceSource`; relations on
`Tenant` + `Employee` (records, OT requests, reviewed OT).
**AC:** migration applies cleanly; `@@unique` on
`[tenantId,date]` (Holiday), `[tenantId,employeeId,workDate]` (Attendance),
`tenantId @unique` (Policy); indexes on FKs + `[tenantId,status]` (OT).
**Verify:** `pnpm prisma migrate dev`; `prisma generate` types resolve.

### Task 0.2: Shared types + RBAC catalog
**Objective:** Single source of truth for DTOs + permissions.
**Files:** `packages/shared/src/types/timesheet.ts` (+ `index.ts` export),
`packages/shared/src/types/rbac.ts`, `apps/api/src/domain/rbac/catalog.ts`.
**Adds:** DTOs — `TimesheetPolicyDto`, `HolidayDto`, `AttendanceRecordDto`,
`OvertimeRequestDto`, and the **stable** `TimesheetSummaryDto`
(`overtime: { category, night, hours, multiplier }[]` etc.). Add
`configure` to `PERMISSION_CATALOG.timesheet`. Grant HR_MANAGER
`+timesheet:update,+timesheet:configure`; MANAGER `+timesheet:update`.
**AC:** `PERMISSION_KEYS` includes `timesheet:configure`; web + api compile.
**Verify:** `pnpm --filter @hrm/shared build`; re-seed grants idempotently.

> ### Checkpoint: Foundation — migration + types + RBAC green; `pnpm typecheck` passes.

---

## Phase 1 — Configuration slices

### Task 1.1: Timesheet Policy (DB→API→UI)
**Objective:** HR views/edits the tenant work + OT-multiplier policy; auto-seed.
**Files:** `domain/timesheet/defaults.ts` (default policy), `repositories/
timesheet-policy.repository.ts`, `services/timesheet-policy.service.ts`,
`controllers/timesheet.controller.ts` (+`routes`,`validators`); web
`features/timesheet/api.ts`, `hooks/useTimesheetPolicy.ts`,
`components/PolicySettings.tsx`.
**AC:** `GET /timesheet/policy` auto-seeds defaults on first read;
`PATCH /timesheet/policy` (`timesheet:configure`) validates multipliers
(OT `>=1`, night `>=0`); UI is a settings card with `tabular-nums`.
**Deps:** 0.1, 0.2.
**Verify:** unit (default seed, validation); integration (RBAC: employee 403 on PATCH).

### Task 1.2: Holiday calendar (DB→API→UI)
**Objective:** Per-tenant holiday CRUD; seed VN statutory holidays.
**Files:** `repositories/holiday.repository.ts`, `services/holiday.service.ts`,
controller/routes/validator additions; web `hooks/useHolidays.ts`,
`components/HolidaySettings.tsx`; `apps/api/prisma/seed.ts` (VN holidays current year).
**AC:** list-by-year + create/update/delete (`timesheet:configure`);
`@@unique([tenantId,date])` enforced with friendly 409; recurring flag stored.
**Deps:** 0.1, 0.2.
**Verify:** unit (uniqueness, recurring); integration (RBAC + tenant isolation).

> ### Checkpoint: Config — policy + holidays editable; OT classification inputs ready.

---

## Phase 2 — Attendance slice

### Task 2.1: Self check-in / check-out + monthly views
**Objective:** Employee records attendance; sees own calendar + list.
**Files:** `repositories/attendance.repository.ts`,
`services/attendance.service.ts` (workedHours, validations), controller/routes/
validator; web `hooks/useAttendance.ts`, `components/CheckInCard.tsx`,
`components/AttendanceCalendar.tsx`, `components/AttendanceList.tsx`,
`pages/TimesheetPage.tsx`, `utils.ts`.
**AC:** check-in creates / check-out updates one record per `[employee,date]`;
no future date; no check-out before check-in; `workedHours` server-computed;
calendar shows present/absent/weekend/holiday + OT badge; skeleton + empty state.
**Deps:** 1.1, 1.2.
**Verify:** unit (workedHours, guards, day classification); E2E (check-in→appears).

### Task 2.2: Reviewer correction + team attendance
**Objective:** HR/Manager create/correct a member's record (audited); scoped list.
**Files:** attendance service/controller (`POST /attendance` manual-adjust,
`source=MANUAL_ADJUST`, `adjustedById`); `GET /attendance` reviewer scope
(`employeeId`/`month`/`department`); web `components/AttendanceAdjustSheet.tsx`.
**AC:** MANAGER limited to direct reports, HR all; every adjust audit-stamped;
employee cannot adjust others (403).
**Deps:** 2.1.
**Verify:** integration (scope matrix); unit (audit fields set).

> ### Checkpoint: Attendance — self + reviewer flows, role-scoped, audited.

---

## Phase 3 — Overtime slice

### Task 3.1: Submit OT + list (DB→API→UI)
**Objective:** Employee submits OT; category derived server-side; lists role-scoped.
**Files:** `repositories/overtime.repository.ts`, `services/overtime.service.ts`
(category derivation from policy+holidays), controller/routes/validator; web
`hooks/useOvertime.ts`, `components/OvertimeForm.tsx`, `components/OvertimeTable.tsx`,
`components/OvertimeStatusBadge.tsx`.
**AC:** `POST /overtime` derives `OT_WEEKDAY|OT_WEEKEND|OT_HOLIDAY` + `night`;
new request `PENDING`; list scoped (own / team / all) with filters.
**Deps:** 1.1, 1.2.
**Verify:** unit (category derivation incl. holiday-overrides-weekend); integration (RBAC).

### Task 3.2: Approve / reject / cancel + cap warnings
**Objective:** Single-reviewer decision with immutable multiplier snapshot.
**Files:** overtime service/controller (`approve`,`reject`,`cancel`); web
`OvertimeTable` actions + `RejectDialog`; cap-warning surfacing in reviewer UI.
**AC:** approve snapshots effective multiplier(s) onto request; reject needs note;
owner cancels only while PENDING; cannot approve own; cannot re-decide non-PENDING;
40h/month + 200h/year shown as **warning** to reviewer, never auto-rejects.
**Deps:** 3.1.
**Verify:** unit (snapshot, state guards, cap thresholds); E2E (submit→approve→snapshot).

> ### Checkpoint: Overtime — full lifecycle, snapshot immutability, cap warnings.

---

## Phase 4 — Summary contract + integration

### Task 4.1: Timesheet summary endpoint (the Payroll contract)
**Objective:** Deterministic per-employee/month aggregation for Payroll.
**Files:** `services/timesheet-summary.service.ts`, controller/route
`GET /timesheet/summary`; consumes Attendance + APPROVED OvertimeRequest +
APPROVED LeaveRequest (join `LeaveType.paid`) + Holiday + Policy.
**AC:** returns `TimesheetSummaryDto` (workingDaysInPeriod, daysPresent,
daysAbsent, paid/unpaidLeaveDays, holidayCount, totalWorkedHours,
overtime[]); pure read; self or reviewer scope; leave days NOT counted as absent.
**Deps:** 2.1, 3.2.
**Verify:** unit (leave overlay, paid/unpaid split, OT grouping, determinism);
integration (scope).

### Task 4.2: Role-adaptive page + team summary + wiring
**Objective:** Ship the real screen; remove placeholder.
**Files:** web `pages/TimesheetPage.tsx` (role-adaptive: EMPLOYEE self;
MANAGER/HR team-summary table consuming `/summary`), `components/
TeamSummaryTable.tsx`; `apps/web/src/router.tsx:117` → real page gated by
`timesheet:view`; i18n `locales/{vi,en}/timesheet.json`; `features/timesheet/index.ts`.
**AC:** EMPLOYEE lands on own calendar+check-in; MANAGER/HR land on team summary;
filters (month/department); skeleton, empty state, dark mode, WCAG AA, `tabular-nums`.
**Deps:** 4.1.
**Verify:** E2E (role-adaptive landing); manual browser pass (preview) light+dark.

> ### Checkpoint: Feature complete — ready for `/test` then `/review`.

---

## Risks & mitigations
- **OT category vs holiday/weekend overlap** → centralize day-classification in one
  pure helper, unit-tested across boundary cases (holiday on a weekend, etc.).
- **Summary drift breaking Payroll** → freeze `TimesheetSummaryDto` in `@hrm/shared`;
  "Ask First" before changing it (per spec boundary).
- **Retro-changed multipliers** → snapshot at approval; never read live policy for
  approved OT.
- **Tenant leakage / RBAC gaps** → integration test the scope matrix on every route
  (employee/manager/HR), per the RBAC-for-new-screens rule.
