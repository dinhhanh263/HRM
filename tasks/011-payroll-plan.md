# Plan: SPEC-011 Payroll / Bảng lương

**Spec:** `docs/specs/011-payroll.md`
**Created:** 2026-06-02
**Strategy:** Thin shared foundation, then vertical slices. **Risk front-loaded:**
the pure pay-calculation engine (proration + OT + insurance + progressive PIT) is
the riskiest piece and is built TDD as its own slice before any run orchestration.
Payroll consumes the frozen `TimesheetSummaryDto` from SPEC-010 — never re-derives
attendance/OT.

## Codebase integration points (surveyed, read-only)

- **API layering mirrors Timesheet/Leave:** `domain/payroll/*` (pure engine,
  defaults, mappers), `domain/repositories/*.repository.ts`,
  `domain/services/*.service.ts`, `app/controllers/payroll.controller.ts`,
  `app/validators/payroll.validator.ts`, `app/routes/v1/payroll.routes.ts`.
- **Route registration:** add `router.use('/payroll', payrollRoutes)` in
  `apps/api/src/app/routes/index.ts`.
- **Timesheet feed (truth):** `apps/api/src/domain/services/timesheet-summary.service.ts`
  → `timesheetSummaryService.getSummary(tenantId, employeeId, 'YYYY-MM')`
  returns `TimesheetSummaryDto`. Consume directly in-process.
- **Prisma:** `apps/api/prisma/schema.prisma`; sample seed in a new
  `apps/api/prisma/seed-payroll.ts` (mirrors `seed-timesheet.ts`, add
  `db:seed:payroll` script).
- **RBAC:** `payroll:['view','process','export']` already in
  `packages/shared/src/types/rbac.ts`; grant roles in
  `apps/api/src/domain/rbac/catalog.ts`.
- **Shared DTOs:** new `packages/shared/src/types/payroll.ts`, export in
  `packages/shared/src/types/index.ts`.
- **Web feature mirrors Timesheet:** `apps/web/src/features/payroll/{api,hooks,
  components,pages,utils}.*` with a barrel `index.ts`.
- **Web route:** replace the payroll placeholder in `apps/web/src/router.tsx`
  (`/payroll` → real `PayrollPage`, gated by `RequirePermission payroll:view`).
- **Nav:** `apps/web/src/components/layout/Sidebar.tsx` already lists Lương.
- **i18n:** add `payroll` namespace under `apps/web/src/i18n/locales/{vi,en}/`.
- **Money util:** add `formatVND` to `apps/web/src/lib/utils.ts`
  (`Intl.NumberFormat('vi-VN', { style:'currency', currency:'VND' })`).
- **PDF library decision:** use **`pdfkit`** (MIT, pure Node, streaming, no
  headless browser) for server-side payslip PDFs. Rejected: `@react-pdf/renderer`
  (heavier, React runtime on server), HTML→PDF via puppeteer (headless-browser dep).

---

## Phase 0 — Foundation (schema + shared types + RBAC)

### Task 0.1: Prisma models + migration
**Objective:** Persist payroll settings, effective-dated salaries, runs, payslips.
**Files:** `apps/api/prisma/schema.prisma` (+ migration via `prisma migrate dev`)
**Adds:** `PayrollSettings`, `EmployeeSalary`, `PayrollRun`, `Payslip`; enums
`PayrollRunStatus`, `InsuranceBase`; `Employee.dependentsCount Int @default(0)`;
relations on `Tenant` + `Employee` (salaries, payslips). Money fields
`Decimal @db.Numeric(15,2)`; `allowances`/`taxBrackets`/`overtime`/`settingsSnapshot`
as `Json`.
**AC:** migration applies cleanly; `@@unique` on `tenantId` (Settings),
`[tenantId,period]` (Run), `[payrollRunId,employeeId]` (Payslip); index on
`[tenantId,employeeId,effectiveFrom]` (Salary); FdK indexes.
**Verify:** `pnpm prisma migrate dev`; `prisma generate` types resolve.

### Task 0.2: Shared types + RBAC grants
**Objective:** Single source of truth for DTOs + permissions.
**Files:** `packages/shared/src/types/payroll.ts` (+ `index.ts` export),
`apps/api/src/domain/rbac/catalog.ts`.
**Adds:** DTOs — `PayrollSettingsDto`, `EmployeeSalaryDto`, `TaxBracket`,
`AllowanceItem`, `PayrollRunDto`, `PayslipDto` (full breakdown, money as string).
Grant HR_MANAGER `+payroll:process,+payroll:export`; MANAGER `+payroll:view`;
EMPLOYEE `+payroll:view`. Super Admin keeps `*`.
**AC:** `PERMISSION_KEYS` resolves payroll grants; web + api compile; re-seed
grants idempotently.
**Verify:** `pnpm --filter @hrm/shared build`; `pnpm typecheck`.

> ### Checkpoint: Foundation — migration + types + RBAC green; `pnpm typecheck` passes.

---

## Phase 1 — Config + salary slices

### Task 1.1: Payroll Settings (DB→API→UI)
**Objective:** HR views/edits tenant insurance rates, deductions, tax brackets; auto-seed.
**Files:** `domain/payroll/defaults.ts` (default VN settings: 8%/1.5%/1%,
11M/4.4M, 7-step brackets), `repositories/payroll-settings.repository.ts`,
`services/payroll-settings.service.ts`, `controllers/payroll.controller.ts`
(+`routes`,`validators`); web `features/payroll/api.ts`,
`hooks/usePayrollSettings.ts`, `components/PayrollSettings.tsx`.
**AC:** `GET /payroll/settings` auto-seeds defaults on first read;
`PATCH /payroll/settings` (`payroll:process`) validates rates `>=0`, brackets
monotonic; UI settings card with `tabular-nums` + VND.
**Deps:** 0.1, 0.2.
**Verify:** unit (default seed, bracket validation); integration (RBAC: employee 403 on PATCH).

### Task 1.2: Employee Salary — effective-dated (DB→API→UI)
**Objective:** HR sets/updates an employee's base + allowances with history.
**Files:** `repositories/employee-salary.repository.ts`,
`services/employee-salary.service.ts` (close-previous-on-new, in-force resolver),
controller/routes/validator; web `hooks/useEmployeeSalary.ts`,
`components/SalarySheet.tsx`, salary surfacing on the payroll page or employee profile.
**AC:** `POST /payroll/salaries` sets new salary, closes prior `effectiveTo`;
no overlapping in-force records; `GET /payroll/salaries/:employeeId` returns
history; `GET /payroll/salaries` lists current; `payroll:process`; amounts `>=0`.
**Deps:** 0.1, 0.2.
**Verify:** unit (in-force resolution by date, no-overlap, allowance taxable flag);
integration (RBAC + tenant isolation).

> ### Checkpoint: Config — settings + salaries manageable; engine inputs ready.

---

## Phase 2 — Pay-calculation engine (RISK-FIRST, pure, TDD)

### Task 2.1: `computePayslip` pure engine
**Objective:** Deterministic (salary + summary + settings + dependents) → breakdown.
**Files:** `domain/payroll/payslip.engine.ts` + `payslip.engine.test.ts`.
**AC:** implements spec §4 exactly — prorated base (guard `workingDays=0`),
allowance total, OT pay via `hourlyRate × hours × multiplier` over summary
`overtime[]`, gross, insurance (both bases + optional cap), taxable income
(floor 0, exclude non-taxable allowances + personal/dependent deductions),
progressive PIT over configured brackets, net; whole-VND rounding; returns every
intermediate figure. **No I/O.**
**Deps:** 0.2.
**Verify:** unit — full month vs unpaid/absent proration; OT across
category×night with snapshotted multipliers; insurance cap on/off, GROSS vs
BASE_SALARY; taxable floor; **every PIT bracket boundary**; rounding; zero-working-days.

> ### Checkpoint: Engine — exhaustively unit-tested, ≥95% on the engine file.

---

## Phase 3 — Payroll run lifecycle

### Task 3.1: Create + compute a run (DRAFT)
**Objective:** Generate a payslip line per eligible employee for a period.
**Files:** `repositories/payroll-run.repository.ts`,
`services/payroll-run.service.ts` (orchestrates: list ACTIVE employees w/ salary
in force → fetch each `TimesheetSummaryDto` → `computePayslip` → persist lines +
run totals), controller/routes/validator; web `hooks/usePayrollRuns.ts`,
`components/CreateRunDialog.tsx`, `components/RunLinesTable.tsx`.
**AC:** `POST /payroll/runs {period}` creates DRAFT (`@@unique[tenantId,period]`,
friendly 409 on dup); computes lines for every ACTIVE employee with an in-force
salary; run carries headcount + totals; idempotent re-create replaces DRAFT lines;
`payroll:process`.
**Deps:** 1.1, 1.2, 2.1.
**Verify:** unit (orchestration with stubbed summary); integration (RBAC,
uniqueness, totals == Σ lines, tenant isolation).

### Task 3.2: Review/recompute + approve + mark-paid + cancel
**Objective:** Lifecycle transitions with snapshot immutability.
**Files:** payroll-run service/controller (`recompute`,`approve`,`markPaid`,
`cancel`); web `RunLinesTable` actions + status badges + confirm dialogs.
**AC:** `recompute` DRAFT-only; `approve` snapshots settings + per-line inputs,
locks run (APPROVED immutable); `markPaid` APPROVED→PAID (+`paidAt`); `cancel`
from DRAFT/APPROVED (not PAID); illegal transitions rejected; all `payroll:process`.
**Deps:** 3.1.
**Verify:** unit (transition guards, snapshot freeze); integration (PAID read-only;
recompute after approve rejected); E2E (create→review→approve→mark-paid).

> ### Checkpoint: Run — full lifecycle, snapshot immutability, totals correct.

---

## Phase 4 — Payslip views + PDF

### Task 4.1: Self payslip + HR run drill-in (UI)
**Objective:** Employees see own payslips; HR drills into any line.
**Files:** controller/routes `GET /payroll/payslips/me`, `GET /payroll/payslips/:id`
(self, or any with `payroll:process`); web `hooks/usePayslips.ts`,
`components/PayslipDetail.tsx`, `pages/PayrollPage.tsx` (role-adaptive).
**AC:** EMPLOYEE/MANAGER list own payslips (APPROVED/PAID only) + full breakdown;
HR sees per-run table + drill-in; self-scope enforced (others → 403 without
`payroll:process`); skeleton, empty state, VND `tabular-nums`, dark mode, WCAG AA.
**Deps:** 3.2.
**Verify:** integration (self-scope matrix); E2E (employee opens own payslip).

### Task 4.2: Payslip PDF (single + bulk export)
**Objective:** Server-side VN payslip PDF.
**Files:** `domain/payroll/payslip.pdf.ts` (pdfkit renderer),
controller/routes `GET /payroll/payslips/:id/pdf`, `GET /payroll/runs/:id/export`
(`payroll:export`, zip/stream); web download buttons in `PayslipDetail` + run table.
**AC:** single PDF (company + employee header, itemized earnings/deductions, net),
VN-formatted; bulk export for a run (HR); self-scope on single PDF; PDF never logs
amounts.
**Deps:** 4.1.
**Verify:** unit (renderer produces a valid PDF buffer for a sample payslip);
integration (RBAC on pdf + export); manual (open a generated PDF).

> ### Checkpoint: Payslips — viewable + downloadable, role-scoped.

---

## Phase 5 — Wiring + sample data + polish

### Task 5.1: Route/nav wiring, i18n, sample seed, browser pass
**Objective:** Ship the real screen end-to-end; remove placeholder.
**Files:** `apps/web/src/router.tsx` (payroll placeholder → real page gated by
`payroll:view`); `features/payroll/index.ts`; i18n `locales/{vi,en}/payroll.json`;
`apps/api/prisma/seed-payroll.ts` + `db:seed:payroll` script (salaries for the
4 seeded employees + one APPROVED run for May 2026 consuming seeded timesheet).
**AC:** role-adaptive landing (EMPLOYEE own payslips; HR run management); seeded
demo data renders; light+dark verified in preview.
**Deps:** 4.2.
**Verify:** E2E (role-adaptive landing); manual browser pass (preview) light+dark.

> ### Checkpoint: Feature complete — ready for `/test` then `/review`.

---

## Risks & mitigations
- **Calc correctness (proration/PIT)** → pure engine, TDD, every bracket boundary
  + proration edge unit-tested before any orchestration (Phase 2 front-loaded).
- **Retro-changed pay** → snapshot salary + settings + summary onto an APPROVED
  run; never read live config for an approved period.
- **Double-counting leave/absence** → trust `TimesheetSummaryDto`'s pre-split
  buckets; never re-derive in payroll.
- **Tenant leakage / RBAC gaps** → integration-test the self-scope matrix on every
  route (employee/manager/HR), per the RBAC-for-new-screens rule.
- **Money precision** → `Decimal @db.Numeric(15,2)` end-to-end; string in DTOs;
  whole-VND rounding centralized in the engine.
- **PDF dependency risk** → pdfkit (no headless browser); renderer isolated in one
  file behind a typed input so it can be swapped.
