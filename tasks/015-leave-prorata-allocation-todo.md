# TODO: Auto Pro-rata Leave Allocation (#015)

> Plan: `tasks/015-leave-prorata-allocation-plan.md`

## Slice 1: Pro-rata math helper (foundation)
- [x] 1.1 Write `leave-allocation.helper.test.ts` (months table, 0.5 rounding, clamps) — RED
- [x] 1.2 Implement `computeProratedDays()` in `leave-allocation.helper.ts` — GREEN

## Checkpoint: math locked

## Slice 2: Tenant leave-settings toggle (E2E)
- [x] 2.1 Shared types `LeaveSettingsDto` + `UpdateLeaveSettingsRequest`
- [x] 2.2 `tenant-settings.repository.ts` (read/merge Tenant.settings JSON)
- [x] 2.3 `leave-settings.service.ts` (+ unit test: default false, round-trip, merge-safe)
- [x] 2.4 Validator `updateLeaveSettingsSchema` + controller `getSettings`/`updateSettings`
- [x] 2.5 Routes `GET`/`PATCH /leave/settings` gated by `leave:configure`
- [x] 2.6 Integration test: GET default, PATCH persists, 403 for non-configure
- [x] 2.7 FE hooks `useLeaveSettings` / `useUpdateLeaveSettings`
- [x] 2.8 FE `LeaveSettingsCard` + mount in Leave settings tab + i18n vi/en
- [ ] 2.9 Manual: toggle persists across reload; hidden without permission

## Checkpoint: toggle works standalone

## Slice 3: Pro-rata on single create
- [x] 3.1 `leave-allocation.service.ts` `seedProratedAllocations()` (+ unit test)
- [x] 3.2 Wire into `employee.service.create` post-commit (try/catch → log + continue)
- [x] 3.3 Integration: toggle on → create → pro-rated balances; off → defaultDays

## Checkpoint: single create pro-rates

## Slice 4: Pro-rata on bulk import
- [x] 4.1 Wire `seedProratedAllocations` into `employee-import.processor` per row
- [x] 4.2 Test: import seeds pro-rated rows; off → none; one row failure ≠ batch abort

## Final checkpoint
- [ ] Coverage ≥ 80% on new code; `tsc --noEmit` clean (api+web+shared)
- [ ] Manual verify both join months + toggle off
- [ ] `/review` five-axis, then ship
