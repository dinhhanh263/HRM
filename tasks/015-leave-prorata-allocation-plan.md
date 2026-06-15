# Plan: Auto Pro-rata Annual Leave Allocation for New Employees

> Spec: `docs/specs/015-leave-prorata-allocation.md`
> Workflow: `/spec` ✅ → `/plan` (this) → `/build` → `/test` → `/review` → Ship

## Analysis (codebase grounding)

| Concern | Location | Notes |
|---------|----------|-------|
| Tenant settings store | `apps/api/prisma/schema.prisma:105` — `Tenant.settings Json @default("{}")` | Reuse; no migration needed |
| Settings pattern to mirror | `payroll-settings.{repository,service}.ts` + `payroll.routes.ts` GET/PATCH `/settings` | Same shape: read→default→update |
| Balance read logic | `leave-balance.service.ts:43` — `allocated = override ?? type.defaultDays` | Unchanged; we only write overrides |
| Balance write | `leave-balance.repository.ts` `upsertAllocation({tenantId,employeeId,leaveTypeId,year,allocated})` | Idempotent on unique key |
| Leave types | `leave-type.repository.ts` `findAll(tenantId,{activeOnly})` → fields `defaultDays,paid,active,code` | Filter `defaultDays>0` |
| Single create | `employee.service.ts:129` `create(tenantId,input,canAssignRole)` (tx) | Hook after employee row created |
| Bulk import | `employee-import.processor.ts` per-row create loop | Hook per imported row |
| Permission gate | `requirePermission('leave:configure')` in `leave.routes.ts:24,39` | Reuse for `/leave/settings` |
| FE settings pattern | `features/payroll/components/PayrollSettings.tsx` + `usePayrollSettings.ts` | Mirror hooks + form |
| FE toggle pattern | `features/leave/components/LeaveTypeSettings.tsx:332` styled `<input type=checkbox>` | No Switch primitive |
| Permission UI gate | `<Can permission="leave:configure">` | Reuse |

## Dependency graph

```
Slice 1 (pure helper)  ─┐
                        ├─→ Slice 3 (single-create hook) ─→ Slice 4 (import hook)
Slice 2 (settings E2E) ─┘
```

Slice 1 and Slice 2 are independent and can be built in either order. Slice 3 needs
both. Slice 4 reuses Slice 3's routine.

---

## Slice 1 — Pro-rata math helper (foundation, risk-first)

**Objective**: A pure, I/O-free function that converts (defaultDays, joinDate, year)
into a pro-rated, 0.5-rounded allocation. Correctness is the heart of the feature, so
build + lock with tests first.

**Files**:
- `apps/api/src/domain/leave/leave-allocation.helper.ts` (new)
- `apps/api/tests/unit/leave-allocation.helper.test.ts` (new)

**Behaviour**:
- `computeProratedDays(defaultDays: number, joinDate: Date, year: number): number`
- If `joinDate` year `< year` → full year (12 months). If `> year` → 0. Else
  `monthsRemaining = 13 - (joinMonth 1..12)`.
- `raw = defaultDays * monthsRemaining / 12`; `round = Math.round(raw*2)/2`;
  clamp `[0, defaultDays]`.

**Acceptance**:
- [ ] defaultDays 12: Jan→12, Aug→5, Oct→3, Nov→2, Dec→1.
- [ ] defaultDays 15, Nov → 2.5 (0.5 rounding).
- [ ] defaultDays 0 → 0.
- [ ] joinDate in a prior year + target year → 12-month (full); future year → 0.
- [ ] Never exceeds defaultDays; never negative.

**Verification**: `vitest run leave-allocation.helper.test.ts` green.

---

## Slice 2 — Tenant leave-settings toggle (end-to-end, vertical)

**Objective**: HR can read and flip a persistent "pro-rata for new employees" toggle.
Delivers visible, persisted functionality on its own (even before it changes create).

**Files (backend)**:
- `packages/shared/src/types/leave.ts` — add `LeaveSettingsDto { proRataEnabled: boolean }`
  + `UpdateLeaveSettingsRequest`.
- `apps/api/src/domain/repositories/tenant-settings.repository.ts` (new) —
  `getSettings(tenantId)` / `mergeSettings(tenantId, patch)` over `Tenant.settings` JSON.
- `apps/api/src/domain/services/leave-settings.service.ts` (new) —
  `getProRata(tenantId): Promise<LeaveSettingsDto>` (default false),
  `setProRata(tenantId, enabled)`.
- `apps/api/src/app/validators/leave.validator.ts` — `updateLeaveSettingsSchema`.
- `apps/api/src/app/controllers/leave.controller.ts` — `getSettings` / `updateSettings`.
- `apps/api/src/app/routes/v1/leave.routes.ts` — `GET`/`PATCH /settings`,
  `requirePermission('leave:configure')`.

**Files (frontend)**:
- `apps/web/src/features/leave/hooks/useLeaveSettings.ts` (new) — `useLeaveSettings` (GET),
  `useUpdateLeaveSettings` (PATCH, invalidates).
- `apps/web/src/features/leave/components/LeaveSettingsCard.tsx` (new) — labeled checkbox,
  helper text, gated by `can('leave:configure')`, toast on save.
- Surface the card in the Leave "settings" (Leave Types) tab —
  `features/leave/components/LeaveTypeSettings.tsx` or `pages/LeavePage.tsx`.
- `apps/web/src/i18n/locales/{vi,en}/leave.json` — `settings.prorata.*`.

**Acceptance**:
- [ ] `GET /leave/settings` → `{ proRataEnabled:false }` by default.
- [ ] `PATCH { proRataEnabled:true }` persists; subsequent GET returns true.
- [ ] Merge does not clobber other `Tenant.settings` keys.
- [ ] Non-`leave:configure` user → 403; toggle hidden in UI.
- [ ] UI checkbox reflects server state, saves with toast, no hardcoded color/text.

**Dependencies**: none.

**Verification**: unit (`leave-settings.service.test.ts`), integration (GET/PATCH +
403), FE manual: toggle persists across reload.

---

## Slice 3 — Apply pro-rata on single employee create

**Objective**: With the toggle on, creating one employee seeds pro-rated balance
overrides for the join year across all active leave types with defaultDays > 0.

**Files**:
- `apps/api/src/domain/services/leave-allocation.service.ts` (new) —
  `seedProratedAllocations(tenantId, employeeId, joinDate)`: reads toggle (Slice 2),
  loads active types, computes (Slice 1), upserts per type for `joinDate`'s year.
  No-op if toggle off or no joinDate.
- `apps/api/src/domain/services/employee.service.ts` — call after create (outside the
  critical tx or post-commit); wrap in try/catch → log + continue on failure.
- `apps/api/tests/unit/leave-allocation.service.test.ts` (new).
- `apps/api/tests/integration/leave.test.ts` (extend) — toggle on → create → balances
  pro-rated; toggle off → defaultDays.

**Acceptance**:
- [ ] Toggle on + create employee (join Nov, AL default 12) → AL allocated = 2 for join year.
- [ ] Types with defaultDays 0 get no override row.
- [ ] Toggle off → no override rows written.
- [ ] Seeding failure does not fail employee creation (logged).
- [ ] Manual HR "Adjust" still overrides afterward.

**Dependencies**: Slice 1, Slice 2.

**Verification**: unit + integration green; manual create via UI shows pro-rated balance.

---

## Slice 4 — Apply pro-rata on bulk import

**Objective**: Bulk-imported employees get the same pro-rata treatment when toggle on.

**Files**:
- `apps/api/src/domain/employee-import/employee-import.processor.ts` — call
  `seedProratedAllocations` per successfully created row (same try/catch contract).
- `apps/api/tests/integration/` (extend import test if present) or processor unit test.

**Acceptance**:
- [ ] Importing N employees with toggle on seeds pro-rated rows per row's join year.
- [ ] Toggle off → no overrides.
- [ ] A seeding error on one row does not abort the import batch.

**Dependencies**: Slice 3.

**Verification**: integration/processor test green.

---

## Checkpoint: Feature complete
- [ ] All 4 slices' acceptance criteria pass.
- [ ] New-code coverage ≥ 80%.
- [ ] `tsc --noEmit` clean (api + web + shared).
- [ ] Manual: toggle on → create employee in two join months → balances correct in
      the Adjust panel; toggle off → defaultDays restored for new hires.
- [ ] `/review` five-axis before merge.

## Risks / notes
- **Timing of seeding vs tx**: seed *after* the employee transaction commits so a
  balance write never rolls back a successful hire. Failure path logs and continues.
- **joinDate optional**: single-create may omit joinDate; import defaults to today. If
  absent, skip pro-rata (fall back to defaultDays) — document in helper/service.
- **Permission choice**: using `leave:configure` (confirmed) — keeps the toggle with
  other leave config; revisit only if a generic settings page is preferred later.
