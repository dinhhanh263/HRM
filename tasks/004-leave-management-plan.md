# Implementation Plan: Leave Management Module

**Spec:** [docs/specs/004-leave-management.md](../docs/specs/004-leave-management.md)
**Created:** 2026-05-31
**Estimated:** ~18 tasks across 5 phases

---

## Overview — vertical slices (DB → API → UI), TDD where it pays off.

```
Phase 1: Foundation     → Prisma models, shared types, permissions, migration, seed
Phase 2: Leave Types    → Full-stack config CRUD
Phase 3: Requests+Balance → Service logic (working days, balance), endpoints
Phase 4: Frontend       → Role-adaptive screen, hooks, components, i18n, router
Phase 5: Verify         → typecheck, tests, browser smoke, review
```

## Phase 1 — Foundation
- 1.1 Prisma: `LeaveType`, `LeaveRequest`, `LeaveBalance`, enum `LeaveStatus`; relations on Tenant/Employee. Migrate.
- 1.2 Shared types: `LeaveTypeDto`, `LeaveRequestDto`, `LeaveBalanceDto`, request/query inputs, `LeaveStatus`/codes.
- 1.3 Permissions: extend `PERMISSION_CATALOG.leave` (+reject, +configure); update `SYSTEM_ROLES` grants.
- 1.4 Seed: 5 default leave types per tenant (idempotent).

## Phase 2 — Leave Types (config)
- 2.1 `leave-type.repository.ts`
- 2.2 `leave-type.service.ts` (+ unit tests: conflict on code, block delete when used)
- 2.3 `leave.validator.ts` (leave-type schemas)
- 2.4 controller + routes (`leave:view` read, `leave:configure` write)

## Phase 3 — Requests + Balances
- 3.1 `leave-days.helper.ts` (working-day count, half-day) + unit tests
- 3.2 `leave-request.repository.ts`, `leave-balance.repository.ts`
- 3.3 `leave.service.ts`: create (overlap/quota/working-days), list (role scope), approve, reject, cancel, balance summary (auto-provision). Unit tests for each branch.
- 3.4 controller + routes wired into `routes/index.ts`.
- 3.5 integration test (happy path: create → approve → balance updated).

## Phase 4 — Frontend (`features/leave`)
- 4.1 `hooks/useLeave.ts` (types, balances, requests queries + mutations)
- 4.2 `components/LeaveStatusBadge.tsx` (+ test)
- 4.3 `components/LeaveBalanceCards.tsx`
- 4.4 `components/LeaveRequestFormSheet.tsx` (RHF + Zod) (+ test)
- 4.5 `components/LeaveTable.tsx` + `ReviewLeaveDialog.tsx`
- 4.6 `components/LeaveTypeSettingsSheet.tsx` (config, `leave:configure`)
- 4.7 `pages/LeavePage.tsx` (role-adaptive tabs) (+ test)
- 4.8 i18n `leave.json` (vi + en) + register in `i18n/index.ts`
- 4.9 router: replace placeholder with `RequirePermission permission="leave:view"`

## Phase 5 — Verify
- 5.1 `pnpm --filter @hrm/api typecheck && test`; `--filter web typecheck && test`
- 5.2 Start api + web dev; browser smoke (employee view + reviewer view) with screenshots
- 5.3 Self-review (correctness, security/RBAC, a11y, design-system, i18n)

## Risks / decisions
- Half-day limited to single-day requests (keeps `totalDays` math simple).
- Working days = Mon–Fri; public holidays out of scope (no holiday table yet).
- Balance `pending` is computed, not stored, to avoid drift.
- LeaveType delete blocked when referenced; soft-deactivate is the path.
