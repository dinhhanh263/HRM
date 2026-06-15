# TODO: Wire up `Employee.dependentsCount` (#016)

> Plan: `tasks/016-dependents-count-plan.md`

## Slice A: Single create/edit + display
- [x] A.1 Shared types: `dependentsCount` in EmployeeDto + Create/Update requests; rebuild shared
- [x] A.2 API validator: create/update schema field (coerce int 0–20)
- [x] A.3 Service: Create/UpdateEmployeeInput + create/update data blocks
- [x] A.4 Integration test: create persists, update changes, omit→0, negative→422 (36/36)
- [x] A.5 FE EmployeeForm number field + zod mirror + default from employee
- [x] A.6 FE EmployeeDetailPage display in personal dl
- [x] A.7 i18n vi/en keys
- [x] A.8 FE form test: renders + submits value (7/7)

## Checkpoint: single create/edit works

## Slice B: Bulk import column
- [x] B.1 Shared employee-import: COLUMNS, LABELS, Parsed/Validated rows, error code
- [x] B.2 Parser: values literal key
- [x] B.3 Validator: numeric parse (blank→0, invalid→error) — RED→GREEN
- [x] B.4 Processor: write dependentsCount
- [x] B.5 Template example rows + note
- [x] B.6 vrow() helper default
- [x] B.7 Tests: validator (15/15) + processor (10/10); import suites 25/25

## Final checkpoint
- [x] tsc --noEmit clean (shared+api+web); all suites green
- [x] Manual: field "Số người phụ thuộc" hiển thị + nhập được trên form/detail (user-verified)
- [x] `/review` five-axis (1 🟡 fixed: form error message); sẵn sàng ship
- [x] E2E nghiệp vụ: `payroll-dependents.test.ts` — 2 NV giống hệt trừ dependents (0 vs 2), seed đủ công cả tháng → assert taxableIncome giảm đúng 2×4.4M và PIT thấp hơn. Toàn bộ 600/600 test API xanh.
