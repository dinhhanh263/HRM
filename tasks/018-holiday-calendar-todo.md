# TODO: Holiday Calendar (018)

## Slice 1: Seed API (backend, end-to-end testable)
- [x] 1.1 Shared types: `SeedHolidaysRequest { year }`, `SeedHolidaysResult { seeded; year }` (+ rebuild @hrm/shared)
- [x] 1.2 Validator `seedHolidaysSchema = z.object({ year: z.number().int().min(2000).max(2100) })`
- [x] 1.3 `holidayService.seed(tenantId, year)` → wrap `seedHolidaysForTenant(db, ...)`, trả `{ seeded, year }`
- [x] 1.4 `timesheetController.seedHolidays` → 200 `{ success, data }`
- [x] 1.5 Route `POST /holidays/seed` gate `timesheet:configure` + `validate`
- [x] 1.6 Integration tests: seed→list chứa lễ chuẩn; idempotent; EMPLOYEE 403; year sai 422

## Checkpoint: Seed API
- [x] api typecheck sạch; tests Slice 1 xanh; suite không vỡ (674 pass)

## Slice 2: Mount settings page + nav (UI hiện diện)
- [x] 2.1 `TimesheetSettingsPage.tsx` render `PolicySettings` + `HolidaySettings` (theo Page Layout Template)
- [x] 2.2 Route `settings/timesheet` bọc `RequirePermission permission="timesheet:view"`
- [x] 2.3 Nav item nhóm `system` → `/settings/timesheet`, gate `timesheet:view`
- [x] 2.4 i18n nav `timesheetSettings` (vi/en) + title

## Checkpoint: UI accessible
- [x] web typecheck sạch; HR navigate thấy Policy + Holiday CRUD chạy live (screenshot)

## Slice 3: Seed button (FE)
- [x] 3.1 `useSeedHolidays()` mutation → POST /seed, invalidate holidays
- [x] 3.2 Nút "Nạp ngày lễ VN năm 20XX" + AlertDialog xác nhận trong HolidaySettings (chỉ canConfigure)
- [x] 3.3 i18n `holiday.seed.*` (vi/en): button, dialog title/desc, toast success/error
- [x] 3.4 FE unit: nút seed hiện khi canConfigure, ẩn khi không

## Checkpoint: Feature complete
- [x] web + api typecheck; web + api tests xanh
- [x] Live: seed năm hiện tại từ trang settings → list đầy lễ chuẩn (screenshot light + dark)
- [x] /review trước khi ship — APPROVE (five-axis): tenant isolation, RBAC, validation, i18n parity đều đạt
