# SPEC-011: Payroll / Bảng lương Module

**Status:** Draft
**Created:** 2026-06-02
**Author:** Claude + Hạnh
**Depends on:** SPEC-002 (Employee), SPEC-003 (RBAC), SPEC-004/005 (Leave),
**SPEC-010 (Timesheet)** — consumes its `TimesheetSummaryDto` as the authoritative
source of working days, paid/unpaid leave, absences, worked hours, and approved
overtime (with snapshotted multipliers).

---

## Objective

Build a payroll (bảng lương) module that turns each employee's monthly timesheet
summary + their effective salary into a reviewable, lockable **payslip** —
covering Vietnamese pay composition (lương cơ bản, phụ cấp, OT, BHXH/BHYT/BHTN,
thuế TNCN) and producing a per-employee PDF. The pay run is a per-tenant,
per-month batch that HR computes, reviews, approves, and marks paid.

Scope decisions for this MVP (confirmed 2026-06-02):
- **Statutory deductions: configurable-simple.** Insurance rates, tax brackets,
  and deduction amounts are tenant-configurable values — not a hardcoded
  full-law engine. The math is structured so the values can later be tightened
  to exact BLLĐ / Luật BHXH / Luật Thuế TNCN compliance without reshaping data.
- **Salary lives in a separate history table** (effective-dated), so raises are
  auditable and a past pay run always uses the salary in force that period.
- **Payslip output: per-employee PDF** (HR can bulk-download).
- **Pay run executes synchronously** inside the request (CodeCrush internal
  scale — tens of employees); can move to BullMQ when it needs to scale.

## Target Users

| User | Actions |
|------|---------|
| **Super Admin** | Everything, incl. configure payroll settings + salaries |
| **HR Manager** | Configure payroll settings, set employee salaries, run/review/approve/mark-paid a period, view all payslips, export |
| **Manager** | View **own** payslip only (no team payroll in MVP) |
| **Employee** | View/download **own** payslips (self-service) |

---

## Core Features

### 1. Payroll Settings (per-tenant, configurable)
Defines how gross becomes net for the tenant — every statutory value is a
config field, never hardcoded.
**Acceptance Criteria:**
- [ ] Single settings row per tenant, auto-seeded with sane VN defaults on first access
- [ ] Insurance (employee-side) rates: `socialInsuranceRate` (BHXH, default 0.08),
      `healthInsuranceRate` (BHYT, default 0.015), `unemploymentInsuranceRate`
      (BHTN, default 0.01); `insuranceBase` = `GROSS` | `BASE_SALARY` (default
      `BASE_SALARY`); optional `insuranceCap` (nullable, e.g. 20× base wage)
- [ ] PIT config: `personalDeduction` (default 11,000,000), `dependentDeduction`
      (default 4,400,000), and `taxBrackets` — ordered `[{ upTo, rate }]`
      (nullable `upTo` = top bracket). Default = the 7-step VN progressive table.
- [ ] `payDay` (day-of-month, informational), `currency` (default `VND`)
- [ ] Editable by `payroll:process`; rates validated `>= 0`, brackets monotonic
- [ ] Settings used in a run are **snapshotted onto the run** so later edits never
      retro-change an approved period

### 2. Employee Salary (effective-dated history)
**Acceptance Criteria:**
- [ ] HR sets an employee's salary: `baseSalary` + named `allowances`
      (each `{ name, amount, taxable }`), with an `effectiveFrom` date
- [ ] Setting a new salary closes the previous record (`effectiveTo`); only one
      salary is in force per employee per date (no overlap)
- [ ] `Decimal @db.Numeric(15,2)`, VND; amounts `>= 0`
- [ ] A pay run for month M resolves each employee's salary in force on M
- [ ] Edit history is preserved (never hard-overwrite a past record)
- [ ] Permission `payroll:process`; tenant-scoped; self/others never editable by EMPLOYEE

### 3. Payroll Run lifecycle (per-tenant, per-month)
**Acceptance Criteria:**
- [ ] Create a run for a period `YYYY-MM` (`@@unique([tenantId, period])`)
- [ ] Statuses: `DRAFT` → `APPROVED` → `PAID`, plus `CANCELLED`
- [ ] On create/recompute (DRAFT only): compute a payslip line for every ACTIVE
      employee with a salary in force, by consuming `TimesheetSummaryDto`
- [ ] **Review step:** in DRAFT, HR sees all lines, can recompute after fixing
      upstream data (timesheet/salary), before approving
- [ ] `approve` (`payroll:process`) locks the run — lines become immutable, all
      inputs (salary, summary figures, settings) are snapshotted on each line
- [ ] `markPaid` (`payroll:process`) sets `PAID` + `paidAt`; only from `APPROVED`
- [ ] `cancel` allowed from DRAFT/APPROVED (not PAID); recorded, not deleted
- [ ] Run carries totals: headcount, total gross, total deductions, total net
- [ ] Re-running an existing DRAFT replaces its lines idempotently

### 4. Pay calculation engine (pure, deterministic, configurable)
The heart of the module — a side-effect-free function from
(salary + timesheet summary + settings) → payslip breakdown.
**Acceptance Criteria:**
- [ ] **Prorated base:** `base × (workingDaysInPeriod − unpaidLeaveDays −
      daysAbsent) / workingDaysInPeriod` (present + paid leave + holidays are
      paid; unpaid leave + absence are deducted). Guard `workingDaysInPeriod = 0`.
- [ ] **Allowances:** summed from the salary record (carried, not prorated in MVP)
- [ ] **OT pay:** `Σ (hourlyRate × hours × multiplier)` over summary `overtime[]`,
      where `hourlyRate = base / (workingDaysInPeriod × standardHoursPerDay)`;
      multipliers come pre-snapshotted from timesheet — never recomputed here
- [ ] **Gross** = proratedBase + allowances + otPay
- [ ] **Insurance** = `insuranceBase × (BHXH + BHYT + BHTN)`, capped if configured
- [ ] **Taxable income** = gross − insurance − personalDeduction −
      (dependentDeduction × dependents) − non-taxable allowances (floor at 0)
- [ ] **PIT** = progressive over configured `taxBrackets` (marginal, per bracket)
- [ ] **Net** = gross − insurance − PIT − other deductions
- [ ] All money rounded to whole VND (configurable precision); every intermediate
      figure stored on the payslip line for transparency (no black-box totals)

### 5. Payslip views + PDF (role-adaptive)
**Acceptance Criteria:**
- [ ] EMPLOYEE: list own payslips (by period) + detail showing full breakdown
      (gross components, deductions, net) — only for `APPROVED`/`PAID` runs
- [ ] HR: per-run table of all employee lines with search/filter + totals;
      drill into any line
- [ ] **PDF export** of a single payslip (employee or HR) and bulk export for a
      run (HR, `payroll:export`) — VN-formatted, company + employee header,
      itemized earnings/deductions, net in words optional
- [ ] Skeleton on load, empty state w/ CTA, status badges, `tabular-nums`, VND format
- [ ] Dependents count source: employee field (add `dependentsCount`, default 0)

### 6. Payroll history
**Acceptance Criteria:**
- [ ] HR: list runs filtered by month/status with totals; reopen DRAFT to recompute
- [ ] Employee: own payslip history across periods
- [ ] A PAID run is read-only end-to-end

---

## Data Model

```
PayrollSettings (id, tenantId @unique, currency, payDay,
                 socialInsuranceRate, healthInsuranceRate, unemploymentInsuranceRate,
                 insuranceBase (enum GROSS|BASE_SALARY), insuranceCap Decimal?,
                 personalDeduction Decimal, dependentDeduction Decimal,
                 taxBrackets Json, timestamps)
EmployeeSalary  (id, tenantId, employeeId, baseSalary Decimal, allowances Json
                 [{name,amount,taxable}], effectiveFrom Date, effectiveTo Date?,
                 note, createdById, timestamps)
                 @@index([tenantId, employeeId, effectiveFrom])
PayrollRun      (id, tenantId, period (YYYY-MM), status, settingsSnapshot Json,
                 headcount, totalGross Decimal, totalDeductions Decimal,
                 totalNet Decimal, runById, approvedById?, approvedAt?, paidAt?,
                 timestamps)  @@unique([tenantId, period])
Payslip         (id, tenantId, payrollRunId, employeeId,
                 -- snapshotted inputs
                 baseSalary Decimal, allowances Json, dependents Int,
                 workingDays, daysPresent, paidLeaveDays, unpaidLeaveDays,
                 daysAbsent, holidayCount, overtime Json [{category,night,hours,multiplier,amount}],
                 -- computed breakdown
                 proratedBase Decimal, allowanceTotal Decimal, otPay Decimal,
                 grossPay Decimal, socialInsurance Decimal, healthInsurance Decimal,
                 unemploymentInsurance Decimal, insuranceTotal Decimal,
                 taxableIncome Decimal, personalIncomeTax Decimal,
                 otherDeductions Decimal, netPay Decimal, timestamps)
                 @@unique([payrollRunId, employeeId])
enum PayrollRunStatus { DRAFT APPROVED PAID CANCELLED }
enum InsuranceBase    { GROSS BASE_SALARY }
```
Adds `dependentsCount Int @default(0)` to `Employee`. Adds relations on `Tenant`
and `Employee` (salaries, payslips). Money fields `Decimal @db.Numeric(15,2)`.

## API (all under `/api/v1/payroll`, `authenticate` first)

| Method | Path | Permission | Notes |
|--------|------|-----------|-------|
| GET | `/settings` | `payroll:process` | tenant settings (auto-seed) |
| PATCH | `/settings` | `payroll:process` | update rates/brackets/deductions |
| GET | `/salaries` | `payroll:process` | list current salaries (filters) |
| GET | `/salaries/:employeeId` | `payroll:process` | salary history for an employee |
| POST | `/salaries` | `payroll:process` | set new effective salary |
| GET | `/runs` | `payroll:view` | HR: list runs (filters); role-scoped |
| POST | `/runs` | `payroll:process` | create + compute a period |
| GET | `/runs/:id` | `payroll:view` | run header + lines (HR) |
| POST | `/runs/:id/recompute` | `payroll:process` | DRAFT only |
| POST | `/runs/:id/approve` | `payroll:process` | lock + snapshot |
| POST | `/runs/:id/mark-paid` | `payroll:process` | APPROVED → PAID |
| POST | `/runs/:id/cancel` | `payroll:process` | not from PAID |
| GET | `/payslips/me` | `payroll:view` | own payslips (APPROVED/PAID) |
| GET | `/payslips/:id` | `payroll:view` | own, or any if `payroll:process` |
| GET | `/payslips/:id/pdf` | `payroll:view` | own, or any if `payroll:process` |
| GET | `/runs/:id/export` | `payroll:export` | bulk PDF/zip for the run |

## Permissions added to catalog

`payroll: ['view','process','export']` already exists. Grants:
- **HR_MANAGER** += `payroll:process`, `payroll:export` (already has `payroll:view`)
- **MANAGER** += `payroll:view` (own payslip self-scope only)
- **EMPLOYEE** += `payroll:view` (own payslip self-scope only)
- Super Admin keeps `*`.
Self-scope rule (mirrors timesheet): `payroll:view` without `payroll:process`
sees only own payslips; passing another employee requires `payroll:process`.

## Out of scope (future)

- Exact, certified full-law BHXH/PIT engine (regional min-wage caps, 20× base
  ceiling automation, special allowances' tax-exemption thresholds) — MVP is
  configurable-simple
- Bank-transfer file / disbursement integration; actual money movement
- 13th-month salary, bonuses/commissions engine, retro-pay across periods
- Multi-currency; per-allowance proration; partial-month new-hire edge automation
      beyond the prorate formula
- BullMQ async run + progress UI (MVP runs synchronously)
- Year-end PIT finalization (quyết toán thuế), insurance authority reports
- Employee self-edit of dependents (HR sets it in MVP)

## Technical Approach

- Mirror the **Leave/Timesheet** layering: `domain/payroll` (pure calc engine +
  service + repo), `app/controllers` + `app/routes/v1`, `app/validators` (Zod),
  web `features/payroll` (api hooks, components, pages).
- **Calc engine is a pure function** (`computePayslip(salary, summary, settings,
  dependents)`), unit-tested exhaustively, no I/O — the service orchestrates
  fetching the timesheet summary + salary + settings and persisting results.
- Consume timesheet via `timesheetSummaryService.getSummary(...)` (or its HTTP
  contract) — **never re-derive** attendance/OT; treat the summary as truth.
- **Snapshot everything** used in an approved run (salary, summary figures,
  settings) onto `PayrollRun.settingsSnapshot` + each `Payslip` row, so an
  approved/paid period is fully reproducible and immutable.
- Money as `Decimal` end-to-end; serialize to string in DTOs. Add a shared VND
  formatter on web (`Intl.NumberFormat('vi-VN', currency VND)`).
- PDF: library chosen at `/plan` (candidates: `pdfkit`, `@react-pdf/renderer`,
  or HTML→PDF) — must be MIT, server-side, no headless-browser dependency if avoidable.

## Code Style
- Follow `.claude/rules/*`; TS strict; i18n (vi + en) — new namespace `payroll`.
- Design system per CLAUDE.md + ui-modern.md (calm, dense table, `tabular-nums`,
  skeleton, dark mode, WCAG AA, role-adaptive). Currency right-aligned, `tabular-nums`.

## Testing Strategy
- **Unit (the priority):** the pay engine — proration (full month, unpaid days,
  absences, zero working days), OT pay across categories/night with snapshotted
  multipliers, insurance with/without cap and both bases, taxable-income floor,
  progressive PIT across every bracket boundary, net assembly, VND rounding.
- **Integration:** RBAC on every route (employee can't process, can't see others'
  payslips; self-scope enforced); run lifecycle transitions (illegal transitions
  rejected; PAID is read-only); `@@unique([tenantId, period])`; salary
  effective-dating (no overlap, correct in-force resolution); tenant isolation;
  snapshot immutability after approve.
- **E2E:** HR sets salary → employee has timesheet summary → HR creates run →
  reviews → approves → marks paid → employee downloads own payslip PDF.

## Boundaries
### Always Do
- Tenant-scope every query; enforce RBAC server-side via `requirePermission`
- Treat the timesheet summary as the single source of attendance/OT truth
- Snapshot salary, settings, and summary figures onto an approved run; keep
  APPROVED/PAID runs immutable
- Keep the calc engine pure & deterministic; store every intermediate figure
### Ask First
- Promoting any configurable rate to a hardcoded statutory rule
- Granting MANAGER team-wide payroll visibility (MVP = own payslip only)
- Changing `Payslip`/`PayrollRun` snapshot shape once data exists
- Final PDF library choice (decided at `/plan`)
### Never Do
- Hardcode insurance rates, tax brackets, or deduction amounts in code
- Re-derive attendance/OT inside payroll, or recompute a snapshotted multiplier
- Mutate an APPROVED/PAID run; expose another employee's payslip without `payroll:process`
- Log salary/payslip amounts as PII in app logs
```
