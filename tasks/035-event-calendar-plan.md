# Plan 035 — Event Calendar

> Spec: `docs/specs/035-event-calendar.md`

## Codebase survey

| Concern | File / Pattern |
|---------|----------------|
| Routes API | `apps/api/src/app/routes/v1/dashboard.routes.ts` — thêm `GET /events` |
| Controller | `apps/api/src/app/controllers/dashboard.controller.ts` — pattern `req.user!` + `{success, data}` |
| Service | `apps/api/src/domain/services/dashboard.service.ts` — `resolveScope`, `lifecycleOptions`, `toISODate`, `ictISODate` sẵn dùng |
| Holidays | `holidayService.listByYear(tenantId, year)` → `HolidayDto[]` (date `YYYY-MM-DD`) |
| Validation | Zod — pattern các validator hiện có (422 qua AppError VALIDATION_ERROR) |
| Shared types | `packages/shared/src/types/dashboard.ts` — thêm `CalendarMonthData` |
| Router web | `apps/web/src/router.tsx` — import trực tiếp (KHÔNG lazy — theo codebase thật) + `RequirePermission` |
| Event style | `EVENT_STYLE` + `formatEventDate` đang nằm trong `DashboardPage.tsx` → extract `features/dashboard/event-style.ts` |
| Event navigation | `eventTarget` trong DashboardPage → extract hook `features/dashboard/useEventNavigation.ts` |
| Month grid tham khảo | `features/timesheet/components/AttendanceCalendar.tsx` (Monday-first, 6 tuần) — không dùng trực tiếp |
| i18n | `apps/web/src/i18n/locales/{vi,en}/dashboard.json` — thêm nhóm `calendar.*` |

## Vertical slices

### Task 1 — Backend: `GET /api/v1/dashboard/events?month=YYYY-MM`
**Files**: `packages/shared/src/types/dashboard.ts`, `dashboard.service.ts`,
`dashboard.controller.ts`, `dashboard.routes.ts`, `tests/unit/dashboard.service.test.ts`
(describe mới cho `deriveMonthEvents`), `tests/integration/dashboard.test.ts` (hoặc file mới
`dashboard-events.test.ts`)

- TDD RED:
  - unit `deriveMonthEvents`: birthday/anniversary occurrence đúng tháng+năm (years tính theo
    năm grid), new_joiner theo joinDate, probation/contract theo ICT date trong tháng,
    lifecycle options (company/team/exclude-self), tháng không match → rỗng, sort theo date.
  - integration: HR đủ events + holidays trong response; MANAGER recurring team + probation
    report, không contract; EMPLOYEE chỉ mình; month sai → 422; thiếu token → 401.
- GREEN:
  - `CalendarMonthData` type (shared) + rebuild shared.
  - `deriveMonthEvents(employees, monthKey, lifecycle)` pure — cùng file service.
  - `dashboardService.getCalendarEvents(actor, monthKey)` — `resolveScope` + filter +
    `findEventSourceEmployees` + `holidayService.listByYear(year)` lọc tháng.
  - Controller + route (Zod validate month, `requirePermission('dashboard:view')`).

**Verify**: API unit + integration pass; `tsc --noEmit` API sạch.

### Task 2 — Frontend: trang `/calendar` + nút "Xem lịch"
**Files**:
- Extract: `features/dashboard/event-style.ts` (EVENT_STYLE, formatEventDate),
  `features/dashboard/useEventNavigation.ts` (logic eventTarget SPEC-034) — DashboardPage
  refactor để dùng (tests hiện có phải vẫn pass).
- Mới: `features/calendar/hooks/useCalendarEvents.ts`, `features/calendar/components/EventCalendar.tsx`,
  `features/calendar/pages/CalendarPage.tsx`, `features/calendar/index.ts`.
- Sửa: `router.tsx` (route `/calendar` + RequirePermission dashboard:view),
  `DashboardPage.tsx` (nút Xem lịch navigate), i18n `dashboard.json` vi+en (`calendar.*`).
- TDD RED (file `CalendarPage.test.tsx`):
  - render event đúng ô ngày (mock useCalendarEvents).
  - nút ‹ › đổi tháng → hook gọi với month mới; nút "Hôm nay" về tháng hiện tại.
  - click chip probation → navigate `/probation?employee=`; thiếu quyền → chip không phải button.
  - holiday hiển thị trong ô ngày.
- GREEN: implement grid (Monday-first, ~3 chip + “+N”), skeleton, error alert, today ring,
  `tabular-nums`, transition tokens.

**Verify**: web tests (mới + dashboard cũ) pass; `tsc --noEmit` sạch.

### Checkpoint — E2E verify (business outcome)
- Login manager (tung.ngo) → Dashboard → click "Xem lịch" → `/calendar` tháng 6/2026 hiện
  probation event Cao Đức Anh ngày 16/06 + sinh nhật Đặng Thu Hà 27/06 → click probation chip
  → scorecard mở. Chuyển tháng 7 → events tháng 7. Screenshot light + dark.

## Risks
- `deriveMonthEvents` ngữ nghĩa khác `deriveUpcomingEvents` (in-month vs lead window) — không
  gộp 2 hàm, chỉ share helper; test ranh giới ICT cẩn thận.
- Refactor extract EVENT_STYLE/eventTarget phải giữ 44 dashboard tests xanh.
- Grid 6 tuần chứa ngày tháng kề — events chỉ derive cho tháng đang xem → ô ngoài tháng để
  trống + mờ (đúng AttendanceCalendar pattern).
