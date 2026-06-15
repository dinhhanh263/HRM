# Plan: Wire up `Employee.dependentsCount` end-to-end (#016)

## Problem

`Employee.dependentsCount` (Int, default 0) exists in the schema and is **read** by
payroll (`payroll-run.repository.ts:142` → `payroll-run.service.ts` `dependents:
e.dependentsCount`), where it multiplies the per-dependent legal deduction
(4,400,000 VND/month). But it is **written nowhere** — no create/update API field,
no form input, no import column. Result: every employee has `dependentsCount = 0`,
so dependent tax deduction is always 0 and all employees are over-taxed.

## Goal

Let HR set/edit each employee's number of dependents through:
1. The single create/edit employee form (+ API).
2. The Excel/CSV bulk import (new column).
3. Display it on the employee detail page.

## Constraints / decisions

- Validation: integer, `min(0)`, `max(20)` (sane upper bound; nobody claims 50).
- Default 0 when omitted (matches schema + payroll expectation).
- No backfill needed — existing rows already default to 0; HR edits as required.
- Import column is **optional**: blank cell → 0, never fails the row.
- Server-side validation is authoritative (Zod). FE form mirror only for UX.
- No new permission — uses existing `employee:create` / `employee:update`.

## Vertical slices

### Slice A — Single create/edit (DB already has column)
1. `@hrm/shared`: add `dependentsCount` to `EmployeeDto`, `CreateEmployeeRequest`,
   `UpdateEmployeeRequest`. Rebuild shared.
2. API validator: `dependentsCount: z.coerce.number().int().min(0).max(20).optional()`
   in `createEmployeeSchema` (+ `.optional()` in `updateEmployeeSchema`).
3. `employee.service.ts`: add to `CreateEmployeeInput`/`UpdateEmployeeInput` and to
   both `tx.employee.create`/`update` data blocks (`?? 0` on create).
4. Integration test: create with dependentsCount → persisted; update → changes;
   omitted on create → 0.
5. FE `EmployeeForm.tsx`: number field in "personal" section + zod mirror +
   default value from `employee.dependentsCount`.
6. FE `EmployeeDetailPage.tsx`: show in personal `<dl>`.
7. i18n vi/en: `form.dependentsCount`, `detail.fields.dependentsCount`.
8. FE form test: renders field, submits value.

### Checkpoint A: single create/edit persists + displays

### Slice B — Bulk import column
1. `@hrm/shared` `employee-import.ts`: add `dependentsCount` to `IMPORT_COLUMNS`,
   `IMPORT_COLUMN_LABELS` (vi: "Số người phụ thuộc", en: "Dependents"),
   `ParsedImportRow` (string), `ValidatedImportRow` (number). Add `INVALID_NUMBER`
   error code if not present.
2. Parser: add `dependentsCount: ''` to the `values` literal.
3. Validator (`validateRows`): parse int, blank → 0, invalid/negative/>20 → row
   error (`INVALID_NUMBER`); include in `valid.push`.
4. Processor: add `dependentsCount: row.dependentsCount` to `tx.employee.create`.
5. Template: example rows get `'2'` / `'0'`; add a guidance note.
6. `vrow()` test helper: default `dependentsCount: 0`.
7. Tests: validator (blank→0, valid, invalid→error), processor (persists count).

### Final checkpoint
- `tsc --noEmit` clean (shared + api + web); all suites green.
- Manual: create/edit/import an employee with dependents → payroll deduction
  reflects it.
- `/review` then ship.
