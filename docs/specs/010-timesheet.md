# SPEC-010: Timesheet / Chấm công Module

**Status:** Draft
**Created:** 2026-06-02
**Author:** Claude + Hạnh
**Depends on:** SPEC-002 (Employee), SPEC-003 (RBAC), SPEC-004/005 (Leave)
**Feeds:** SPEC-011 (Payroll) — this module is the authoritative source of
attendance, working-day, and overtime data the payroll engine consumes.

---

## Objective

Build a timesheet (chấm công) module that captures **payroll-grade** attendance
data — days worked, hours worked, approved overtime classified by Vietnamese
labor-law category, and unpaid absences — alongside the everyday attendance UX
(self check-in/out, monthly calendar, manager team view). The module's primary
contract is a per-employee, per-period **timesheet summary** that the upcoming
Payroll module turns into pay.

Benchmarked against BambooHR, Sapling, and Vietnamese tools (Tanca, Base
Checkin): the table-stakes are reliable daily attendance, an overtime request →
approval flow with statutory categories, and a monthly view a manager can sign
off — without the complexity of shift rosters or biometric hardware.

## Target Users

| User | Actions |
|------|---------|
| **Super Admin** | Everything, incl. configure policy + holidays |
| **HR Manager** | Configure policy/holidays, view/correct all records, approve OT, view all summaries |
| **Manager** | View team attendance, approve/reject team OT, view team summary |
| **Employee** | Self check-in/out, submit/cancel own OT requests, view own calendar + summary |

---

## Core Features

### 1. Timesheet Policy (per-tenant, configurable)
Defines what "a working day" and "overtime" mean for the tenant — every value
is configurable because it differs by company and feeds payroll multipliers.
**Acceptance Criteria:**
- [ ] Single policy per tenant, auto-seeded with sane VN defaults on first access
- [ ] Fields: `workdays` (weekday set, default Mon–Fri), `standardHoursPerDay`
      (default 8), `nightStart`/`nightEnd` (default 22:00–06:00 per BLLĐ),
      and OT multipliers: `otWeekday` (1.5), `otWeekend` (2.0), `otHoliday`
      (3.0), `nightExtra` (0.3), `nightOtExtra` (0.2)
- [ ] Editable by `timesheet:configure`; multipliers validated `>= 1.0` (OT) / `>= 0` (night)
- [ ] Multipliers are **snapshotted onto each OT request at approval** so later
      policy edits never retro-change approved/locked pay

### 2. Holiday Calendar (per-tenant)
Required to classify OT as holiday-rate and to mark paid days off.
**Acceptance Criteria:**
- [ ] List/create/edit/delete holidays for a year (`timesheet:configure`)
- [ ] Fields: date, name, `recurring` (fixed-date annual, e.g. 30/4, 1/5, 2/9)
- [ ] Seed VN statutory holidays for the current year (Tết block, Giỗ Tổ 10/3 ÂL
      best-effort, 30/4, 1/5, 2/9) — editable; lunar dates seeded as concrete dates
- [ ] `@@unique([tenantId, date])`; a holiday date overrides weekday/weekend classification

### 3. Check-in / Check-out
**Acceptance Criteria:**
- [ ] Employee records check-in and check-out for a work date (manual, with an
      optional free-text location/note — no GPS/geofence in MVP)
- [ ] One attendance record per employee per date (`@@unique`); check-in creates,
      check-out updates the same record
- [ ] `workedHours` computed server-side from in/out (minus unpaid break if configured later); stored
- [ ] Cannot check out before checking in; cannot record a future date
- [ ] HR/Manager may create/correct a record for a team member (`timesheet:update`),
      always audit-stamped (`source = MANUAL_ADJUST`, `adjustedById`)

### 4. Overtime Request + Approval
**Acceptance Criteria:**
- [ ] Employee submits OT: work date, hours, `night` flag, reason
- [ ] `category` derived server-side from the date vs policy/holidays:
      `OT_WEEKDAY` / `OT_WEEKEND` / `OT_HOLIDAY`
- [ ] New request `PENDING`; reviewer approves (`timesheet:approve`) or rejects with note
- [ ] On approval, snapshot the effective multiplier(s) onto the request
- [ ] Reviewer scope: MANAGER → direct reports; HR/Admin → all; cannot approve own
- [ ] Owner cancels own request while PENDING (ownership, no extra permission)
- [ ] Enforce statutory OT caps as **warnings, not hard blocks** (40h/month,
      200h/year) — surfaced to reviewer; configurable cap, never silently rejects

### 5. Monthly Views (calendar + list, role-adaptive)
**Acceptance Criteria:**
- [ ] EMPLOYEE: own monthly calendar — each day shows present/absent/leave/holiday/weekend
      + OT badge; toggle to a list view of the same period
- [ ] MANAGER/HR: team-summary table for a month — per employee: days present,
      days absent, paid-leave days, unpaid-leave days, total OT hours
- [ ] Filters: month, department (reviewer), status; search by employee (reviewer)
- [ ] Leave overlay: days inside an APPROVED LeaveRequest render as leave (paid/unpaid
      from `LeaveType.paid`), pulled from the Leave module — not double-counted as absent
- [ ] Skeleton on load, empty state with CTA, status badges (color + label), `tabular-nums`

### 6. Timesheet Summary (the Payroll contract)
**Acceptance Criteria:**
- [ ] `GET /timesheet/summary?employeeId=&month=YYYY-MM` returns a typed summary:
      `workingDaysInPeriod`, `daysPresent`, `daysAbsent`, `paidLeaveDays`,
      `unpaidLeaveDays`, `holidayCount`, `totalWorkedHours`, and
      `overtime: [{ category, night, hours, multiplier }]` (APPROVED OT only)
- [ ] Self-access for own summary; reviewer may pass another `employeeId` in scope
- [ ] Deterministic & side-effect-free (pure read) so Payroll can recompute safely
- [ ] Shape is exported from `@hrm/shared` as the stable inter-module DTO

---

## Data Model

```
TimesheetPolicy (id, tenantId @unique, workdays Int[], standardHoursPerDay,
                 nightStart, nightEnd, otWeekday, otWeekend, otHoliday,
                 nightExtra, nightOtExtra, timestamps)
Holiday        (id, tenantId, date, name, recurring, timestamps)
                 @@unique([tenantId, date])
AttendanceRecord(id, tenantId, employeeId, workDate, checkInAt, checkOutAt,
                 note, workedHours, source, adjustedById, timestamps)
                 @@unique([tenantId, employeeId, workDate])
OvertimeRequest (id, tenantId, employeeId, workDate, hours, night, category,
                 reason, status, multiplier, reviewedById, reviewedAt,
                 reviewNote, timestamps)
enum OvertimeCategory { OT_WEEKDAY OT_WEEKEND OT_HOLIDAY }
enum OvertimeStatus   { PENDING APPROVED REJECTED CANCELLED }
enum AttendanceSource { SELF MANUAL_ADJUST }
```
Adds relations on `Tenant` and `Employee` (records, OT requests, reviewed OT).

## API (all under `/api/v1/timesheet`, `authenticate` first)

| Method | Path | Permission | Notes |
|--------|------|-----------|-------|
| GET | `/policy` | `timesheet:view` | tenant policy (auto-seed) |
| PATCH | `/policy` | `timesheet:configure` | update multipliers/hours |
| GET | `/holidays` | `timesheet:view` | list by year |
| POST | `/holidays` | `timesheet:configure` | create |
| PATCH | `/holidays/:id` | `timesheet:configure` | update |
| DELETE | `/holidays/:id` | `timesheet:configure` | delete |
| GET | `/attendance` | `timesheet:view` | own; reviewer scoped by `employeeId`/`month` |
| POST | `/attendance/check-in` | `timesheet:create` | own |
| POST | `/attendance/check-out` | `timesheet:create` | own |
| POST | `/attendance` | `timesheet:update` | reviewer create/correct |
| GET | `/overtime` | `timesheet:view` | role-scoped; filters |
| POST | `/overtime` | `timesheet:create` | submit own |
| POST | `/overtime/:id/approve` | `timesheet:approve` | |
| POST | `/overtime/:id/reject` | `timesheet:approve` | body: note |
| POST | `/overtime/:id/cancel` | (ownership) | owner only |
| GET | `/summary` | `timesheet:view` | payroll contract; own or reviewer |

## Permissions added to catalog

Add `configure` to the `timesheet` resource:
`timesheet: ['view','create','update','approve','configure']`.
Grants: HR_MANAGER += `timesheet:update`, `timesheet:configure`;
MANAGER += `timesheet:update` (team corrections); EMPLOYEE unchanged
(`view`, `create`). Super Admin keeps `*`.

## Out of scope (future)

- Biometric / face-recognition / fingerprint device sync; GPS geofencing
- Shift scheduling, rosters, multiple shifts per day, break-time deduction rules
- Auto-import from physical attendance machines
- The payroll calculation itself (→ SPEC-011); this module only supplies data
- Real-time presence dashboard; lateness penalty rules; flexible/remote policies
- Lunar-calendar engine (Tết/Giỗ Tổ seeded as concrete dates, edited manually)

## Technical Approach

- Mirror the **Leave module** layering: `domain/timesheet` (service + repo),
  `app/controllers` + `app/routes/v1`, `app/validators` (Zod), web
  `features/timesheet` (api hooks, components, pages).
- Single-reviewer approval (SPEC-004 style), **not** the multi-step ApprovalFlow.
- All money-affecting numbers (multipliers, hours) stored as `Float`/`Decimal`
  and **snapshotted at approval** for immutability — payroll must never see a
  retro-changed rate.
- Summary endpoint is a pure aggregation over AttendanceRecord + APPROVED
  OvertimeRequest + APPROVED LeaveRequest (joined to `LeaveType.paid`) +
  Holiday + Policy. Exported DTO `TimesheetSummaryDto` in `@hrm/shared`.

## Code Style
- Follow `.claude/rules/*`; TS strict; i18n (vi + en) — new namespace `timesheet`.
- Design system per CLAUDE.md + ui-modern.md (calm, dense table, `tabular-nums`,
  skeleton, dark mode, WCAG AA, role-adaptive).

## Testing Strategy
- **Unit:** OT category derivation (weekday/weekend/holiday + night); workedHours
  computation; summary aggregation incl. leave overlay & unpaid/paid split;
  multiplier snapshot on approval; OT cap warning thresholds.
- **Integration:** RBAC on every route (employee can't approve, can't see others'
  summaries; manager scoped to reports); check-in/out idempotency & uniqueness;
  tenant isolation.
- **E2E:** employee check-in → submit OT → manager approves → summary reflects it.

## Boundaries
### Always Do
- Tenant-scope every query; enforce RBAC server-side via `requirePermission`
- Snapshot OT multipliers at approval; treat locked/approved data as immutable
- Derive OT category & day classification on the server, never trust the client
### Ask First
- Adding any statutory cap as a **hard block** (default: warning only)
- Changing the `TimesheetSummaryDto` shape once Payroll depends on it
### Never Do
- Hardcode holidays, multipliers, or work-week into code (all configurable)
- Double-count a leave day as an absence; expose another employee's data without scope
```
