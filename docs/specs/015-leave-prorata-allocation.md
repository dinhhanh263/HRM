# Feature: Auto Pro-rata Annual Leave Allocation for New Employees

> Spec #015 · Author: hanhdinh@codecrush.asia · Date: 2026-06-03
> Workflow: `/spec` → `/plan` → `/build` → `/test` → `/review` → Ship

## Objective

When enabled by a company-level toggle, the system automatically pro-rates a new
employee's leave allocation for their **join year** based on how many months remain
in that year, instead of granting the full annual `defaultDays`. HR can flip the
toggle on/off and still override any allocation manually afterward.

## Problem

Today every employee — regardless of join date — receives the full `defaultDays`
of every leave type for any year, because the balance is computed as
`allocated = override ?? type.defaultDays` ([leave-balance.service.ts:43](../../apps/api/src/domain/services/leave-balance.service.ts)).
An employee who joins in November still gets 12 annual-leave days for that year.
HR currently has to fix this by hand for every new hire.

## Target Users

- **HR Manager / Super Admin** (`leave:configure`): turns the toggle on/off; benefits
  from new hires getting a correct first-year allocation automatically.
- **New employees**: receive a fair, pro-rated first-year balance.

## Core Features

### 1. Tenant-level toggle: "Pro-rata leave for new employees"
- Stored in the existing `Tenant.settings` JSON column (key: `leaveProrata.enabled: boolean`, default `false`).
- Read + write via a new tenant-settings service/repository (mirrors the
  `payroll-settings` pattern).
- **API**: `GET /api/v1/leave/settings` and `PATCH /api/v1/leave/settings`, both gated
  by `requirePermission('leave:configure')`.
- **Acceptance**:
  - GET returns `{ proRataEnabled: boolean }`; defaults to `false` when never set.
  - PATCH `{ proRataEnabled: true }` persists and is reflected on the next GET.
  - A user without `leave:configure` gets `403`.

### 2. Pro-rata computation on employee creation
- A pure helper `computeProratedDays(defaultDays, joinDate, year)`:
  - `monthsRemaining = 13 - (joinMonth)` where `joinMonth` is 1–12 **counting the
    join month** (join Nov → 2 months; join Jan → 12 months).
  - `raw = defaultDays * monthsRemaining / 12`.
  - **Round to nearest 0.5**: `Math.round(raw * 2) / 2`.
  - Clamp to `[0, defaultDays]`.
- Applies to **every active leave type with `defaultDays > 0`**. Types with
  `defaultDays === 0` (e.g. unpaid leave) are skipped.
- Writes one `LeaveBalance` override row per qualifying leave type for the join year
  via `leaveBalanceRepository.upsertAllocation` (unique key
  `[tenantId, employeeId, leaveTypeId, year]`).
- **Acceptance** (defaultDays = 12):
  - Join 2026-11-15 → allocated = 2 (12 × 2/12).
  - Join 2026-01-01 → allocated = 12 (full year, but still written as override).
  - Join 2026-08-10 → 12 × 5/12 = 5.0 → 5.
  - Join 2026-10-01 → 12 × 3/12 = 3.
  - defaultDays = 15, join 2026-11 → 15 × 2/12 = 2.5 → 2.5 (rounds to .5).
  - When toggle is **off**, no override rows are written; balances fall back to
    `defaultDays` (current behavior unchanged).

### 3. Hook into both employee creation paths
- **Single create**: `employee.service.create()` — after the employee row is created.
- **Bulk import**: `employee-import.processor.ts` — per imported employee row.
- Both call the same allocation routine. Allocation runs **only if the tenant toggle
  is enabled**.
- **Acceptance**: creating an employee (single or via import) while the toggle is on
  produces pro-rated override rows for the join year; while off, produces none.

## Out of Scope

- **No backfill / recompute** for existing employees. The toggle affects only
  employees created *after* it is enabled. (No bulk "recalculate" action.)
- **No per-leave-type opt-out** of pro-rata (all active types with `defaultDays > 0`
  are pro-rated uniformly).
- **No change** to the manual "Adjust" allocation editor — it keeps working and can
  override pro-rated values.
- **No proration of subsequent years** — only the join year is pro-rated; later years
  use full `defaultDays` as before.
- **No new Switch UI primitive** — reuse the existing styled `<input type="checkbox">`
  pattern.

## Technical Approach

### Data
- Reuse `Tenant.settings` (Json, already exists at [schema.prisma:105](../../apps/api/prisma/schema.prisma)).
  Shape: `{ "leaveProrata": { "enabled": true } }`. No migration needed.
- `LeaveBalance` override rows written through existing `upsertAllocation`.

### Backend
- `tenant-settings.repository.ts` — `getSettings(tenantId)` / `updateSettings(tenantId, patch)`
  reading/merging the JSON column (typed + validated).
- `leave-settings.service.ts` — exposes `getProRata` / `setProRata`; owns the JSON key
  and defaults.
- `leave-allocation.helper.ts` — pure `computeProratedDays()` (unit-tested in isolation).
- `leave-allocation.service.ts` (or a method on the balance service) —
  `seedProratedAllocations(tenantId, employeeId, joinDate)` that:
  reads the toggle, loads active leave types, computes + upserts per type for the join year.
- Wire `seedProratedAllocations` into `employee.service.create()` and the import processor.
- Routes in `leave.routes.ts`: `GET`/`PATCH /settings` gated by `leave:configure`.
- Zod: `updateLeaveSettingsSchema = z.object({ proRataEnabled: z.boolean() })`.

### Frontend
- Shared type `LeaveSettingsDto = { proRataEnabled: boolean }` in `packages/shared`.
- Hook `useLeaveSettings()` (GET) + `useUpdateLeaveSettings()` (PATCH) in
  `apps/web/src/features/leave/hooks/`.
- A settings card on the Leave page — surfaced in the **Leave Types** (`settings`) tab
  or a small section gated by `can('leave:configure')` — with a labeled checkbox toggle,
  optimistic-friendly mutation + toast, and explanatory helper text.
- i18n keys under `leave.json` (`settings.prorata.*`) in both `vi` and `en`.

### Integration points
- `leaveBalanceRepository.upsertAllocation` (write), `leaveTypeRepository.findAll({ activeOnly })`
  (read types), `employee.service.create`, `employee-import.processor`.

## Code Style
- Follow `.claude/rules/` (TS strict, 2-space, single quotes, kebab-case files,
  TanStack Query for all FE data, Zod validation both sides, no hardcoded colors,
  i18n for all text, RBAC gated server-side + UI hiding).
- Allocation math lives in a **pure helper** with no I/O so it is trivially testable.

## Testing Strategy
- **Unit** (`leave-allocation.helper.test.ts`): the rounding + months-remaining table
  above, including boundaries (Jan, Dec, mid-month, defaultDays 0 skipped, .5 rounding).
- **Unit** (`leave-settings.service.test.ts`): default `false`, persist/read round-trip,
  JSON merge does not clobber other settings keys.
- **Integration** (`leave.test.ts` or new): toggle on → create employee → GET balances
  for join year shows pro-rated allocated; toggle off → shows defaultDays. `403` for
  non-configure user on PATCH.
- **Integration**: import path seeds pro-rated rows when toggle on.
- Coverage ≥ 80% on new code.

## Boundaries

### Always Do
- Run pro-rata **only** when the tenant toggle is enabled.
- Pro-rate using the join year derived from `joinDate`; write overrides only for that year.
- Round to nearest 0.5 and clamp to `[0, defaultDays]`.
- Gate settings read/write server-side with `leave:configure` (UI hiding is UX only).
- Keep allocation math pure and unit-tested.

### Ask First
- Adding any backfill/recompute capability for existing employees.
- Changing the permission key from `leave:configure` to a generic `settings:update`.
- Pro-rating leave types differently per type (opt-out flags).

### Never Do
- Never overwrite an allocation that HR already set manually for that
  employee/type/year without it being part of the create flow (creation is the only
  auto-write trigger; later manual edits win).
- Never write overrides when the toggle is off.
- Never apply pro-rata to years other than the join year.
- Never block employee creation if allocation seeding fails — log and continue
  (employee creation is the critical path; balances are recomputable).

## Open Decision (resolved)
- Leave types pro-rated: **all active with `defaultDays > 0`**.
- Paths: **single create AND bulk import**.
- Effective scope: **new employees only (no backfill)**.
- Join-month counting: **inclusive** of the join month.
- Rounding: **nearest 0.5**.
- Permission: **`leave:configure`**.

## Next Step
Run `/plan` to decompose into vertical slices (helper → settings service/route →
create-hook → FE toggle), each independently testable.
