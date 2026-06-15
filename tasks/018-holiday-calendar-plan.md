# Plan: Holiday Calendar (018)

Spec: `docs/specs/018-holiday-calendar.md`

## Context / discovery
Backend CRUD + payroll integration ĐÃ xong và đúng. FE component `HolidaySettings.tsx` và
`PolicySettings.tsx` đã build đủ (i18n vi/en sẵn) nhưng **mồ côi** — không mount ở route nào →
đó là lý do user không thấy. `seedHolidaysForTenant()` đã viết, idempotent, **chưa ai gọi**.

→ Phần code mới thực sự rất nhỏ: **endpoint seed** + **mount UI vào 1 trang settings + nav** +
**nút seed FE**. Không đụng `TimesheetSummaryDto` (STABLE).

## Key files
**Backend**
- `apps/api/src/app/validators/timesheet.validator.ts` — thêm `seedHolidaysSchema`.
- `apps/api/src/domain/services/holiday.service.ts` — thêm `seed(tenantId, year)`.
- `apps/api/src/domain/timesheet/holiday-defaults.ts` — `seedHolidaysForTenant` (dùng lại, không sửa).
- `apps/api/src/app/controllers/timesheet.controller.ts` — thêm `seedHolidays`.
- `apps/api/src/app/routes/v1/timesheet.routes.ts` — `POST /holidays/seed` (gate `timesheet:configure`).
- `packages/shared/src/types/timesheet.ts` — `SeedHolidaysRequest`, `SeedHolidaysResult`.
- `apps/api/tests/integration/timesheet.test.ts` (hoặc holiday test) — tests seed.

**Frontend**
- `apps/web/src/features/timesheet/hooks/useHolidays.ts` — thêm `useSeedHolidays`.
- `apps/web/src/features/timesheet/components/HolidaySettings.tsx` — nút seed + AlertDialog.
- `apps/web/src/features/timesheet/index.ts` — export hook mới nếu cần.
- `apps/web/src/features/settings/pages/TimesheetSettingsPage.tsx` — **mới**, render Policy + Holiday.
- `apps/web/src/router.tsx` — route `settings/timesheet` (RequirePermission `timesheet:view`).
- `apps/web/src/components/layout/Sidebar.tsx` — nav item nhóm `system`, gate `timesheet:view`.
- `apps/web/src/i18n/locales/{vi,en}/nav.json` — label `timesheetSettings`.
- `apps/web/src/i18n/locales/{vi,en}/timesheet.json` — keys `holiday.seed.*`.

## Dependency graph
Slice 1 (seed API) → Slice 3 (nút seed gọi API).
Slice 2 (mount page + nav) độc lập với Slice 1; Slice 3 đặt nút bên trong page đã mount ở Slice 2.
Thứ tự: **1 → 2 → 3**.

## Risks
- Seed ghi đè tên/recurring ngày trùng (upsert) → cần AlertDialog cảnh báo trước khi bấm.
- `validate` middleware validate `req.body`; `year` phải là number → FE gửi number, schema `z.number().int()`.
- Nav item `/settings` cũ trỏ route không tồn tại — KHÔNG sửa trong scope này (chỉ thêm item mới).
- Mount `PolicySettings` cùng trang: đã có sẵn, chỉ render — rủi ro thấp.

## Test strategy (critical-path, assert business outcome)
- API: HR seed 2026 → GET ?year=2026 chứa "Quốc khánh" (02-09) và đủ N ngày; seed lại → vẫn N (idempotent); EMPLOYEE POST /seed → 403; year sai/thiếu → 422.
- FE unit: HolidaySettings render nút seed khi `canConfigure`, ẩn khi không.
- Live: screenshot trang `/settings/timesheet` (HR) sau seed, light + dark.
