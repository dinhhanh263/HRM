# TODO: SPEC-010 Timesheet / Chấm công

Plan: `tasks/010-timesheet-plan.md` · Spec: `docs/specs/010-timesheet.md`

## Phase 0: Foundation
- [x] 0.1 Prisma models + enums + relations + migration
- [x] 0.2 Shared DTOs (incl. `TimesheetSummaryDto`) + `timesheet:configure` + RBAC grants

### Checkpoint: Foundation — migrate + typecheck green

## Phase 1: Configuration
- [x] 1.1 Timesheet Policy: repo + service (auto-seed) + GET/PATCH + PolicySettings UI
- [x] 1.2 Holiday calendar: repo + service + CRUD + HolidaySettings UI + VN seed

### Checkpoint: Config — policy + holidays editable

## Phase 2: Attendance
- [x] 2.1 Self check-in/out + monthly calendar + list view
- [x] 2.2 Reviewer correction (audited) + team-scoped attendance list

### Checkpoint: Attendance — self + reviewer, role-scoped, audited

## Phase 3: Overtime
- [x] 3.1 Submit OT + role-scoped list (server-side category derivation)
- [x] 3.2 Approve/reject/cancel + multiplier snapshot + cap warnings

### Checkpoint: Overtime — full lifecycle + snapshot immutability

## Phase 4: Summary + integration
- [x] 4.1 `GET /timesheet/summary` aggregation (the Payroll contract)
- [x] 4.2 Role-adaptive TimesheetPage + team summary + route/nav/i18n wiring

### Checkpoint: Feature complete — ready for /test → /review
