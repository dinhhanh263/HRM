# TODO: SPEC-011 Payroll / Bảng lương

Plan: `tasks/011-payroll-plan.md` · Spec: `docs/specs/011-payroll.md`

## Phase 0: Foundation
- [x] 0.1 Prisma models (PayrollSettings, EmployeeSalary, PayrollRun, Payslip) + enums + `Employee.dependentsCount` + migration
- [x] 0.2 Shared DTOs (`packages/shared/src/types/payroll.ts`) + RBAC grants (HR_MANAGER +process/export, MANAGER/EMPLOYEE +view)

### Checkpoint: Foundation — migrate + typecheck green

## Phase 1: Config + salary
- [x] 1.1 Payroll Settings: defaults + repo + service (auto-seed) + GET/PATCH + PayrollSettings UI
- [x] 1.2 Employee Salary effective-dated: repo + service (close-prior, in-force resolver) + CRUD + SalarySheet UI

### Checkpoint: Config — settings + salaries manageable; engine inputs ready

## Phase 2: Pay-calculation engine (RISK-FIRST, pure TDD)
- [x] 2.1 `computePayslip` pure engine (proration + OT + insurance + progressive PIT) + exhaustive unit tests

### Checkpoint: Engine — exhaustively unit-tested, ≥95% on engine file

## Phase 3: Payroll run lifecycle
- [x] 3.1 Create + compute run (DRAFT): orchestrate summary → engine → persist lines + totals
- [x] 3.2 Recompute / approve (snapshot) / mark-paid / cancel + status badges + confirm dialogs

### Checkpoint: Run — full lifecycle, snapshot immutability, totals correct

## Phase 4: Payslip views + PDF
- [x] 4.1 Self payslip + HR run drill-in (role-adaptive PayrollPage, self-scope enforced)
- [x] 4.2 Payslip PDF (pdfkit) — single + bulk run export (`payroll:export`)

### Checkpoint: Payslips — viewable + downloadable, role-scoped

## Phase 5: Wiring + sample data + polish
- [x] 5.1 Router/nav/i18n wiring + `seed-payroll.ts` (`db:seed:payroll`) + browser pass (light+dark)

### Checkpoint: Feature complete — ready for /test → /review
