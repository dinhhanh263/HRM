# Plan 034 — Dashboard Upcoming Events: Clickable Links

> Spec: `docs/specs/034-dashboard-upcoming-event-links.md`

## Codebase survey

| Concern | File |
|---------|------|
| Event type | `packages/shared/src/types/dashboard.ts` (`DashboardEvent`, thiếu `employeeId`) |
| Event derivation | `apps/api/src/domain/services/dashboard.service.ts` (`deriveUpcomingEvents`, cờ `includeLifecycle` company-only) |
| Event source query | `apps/api/src/domain/repositories/dashboard.repository.ts` (`findEventSourceEmployees`, thiếu `id`) |
| API tests | `apps/api/tests/unit/dashboard.service.test.ts`, `apps/api/tests/integration/dashboard.test.ts` |
| Widget UI | `apps/web/src/features/dashboard/DashboardPage.tsx` (`EventItem`, chưa click được) |
| Web tests | `apps/web/src/features/dashboard/DashboardPage*.test.tsx` |
| Probation list + create dialog | `apps/web/src/features/probation/components/ProbationReviewList.tsx` (`CreateReviewDialog` chưa nhận preselect) |
| Scorecard sheet | `apps/web/src/features/probation/components/ProbationScorecardSheet.tsx` |

## Vertical slices

### Task 1 — Backend: `employeeId` trong mọi event + lifecycle options cho team scope
**Files**: `packages/shared/src/types/dashboard.ts`, `dashboard.repository.ts`, `dashboard.service.ts`,
`tests/unit/dashboard.service.test.ts`, `tests/integration/dashboard.test.ts`

- TDD: RED — test mới cho (a) mọi event có `employeeId`; (b) team scope nhận `probation_ending`
  của report, KHÔNG của chính manager, KHÔNG `contract_expiring`; (c) company scope giữ nguyên.
- `EventSourceEmployee` + select thêm `id`.
- `deriveUpcomingEvents(employees, now, windowDays, lifecycle: { probation?, contract?, probationExcludeEmployeeId? })`.
- Call site: company → `{probation:true, contract:true}`; team → `{probation:true, probationExcludeEmployeeId: scope.employeeId}`.

**Verify**: `npm test` (API unit + integration dashboard) pass.

### Task 2 — Frontend: EventItem clickable + điều hướng theo quyền
**Files**: `apps/web/src/features/dashboard/DashboardPage.tsx`, dashboard tests

- TDD: RED — test render: probation event là button (khi có `probation:view`) navigate
  `/probation?employee=<id>`; birthday event navigate `/employees/<id>` (khi có `employees:view`);
  thiếu quyền → không phải button.
- `EventItem` nhận `onClick?`; render `<button>` khi có, `<div>` khi không. Hover/focus-visible
  theo design tokens; `transition-colors duration-100`.

**Verify**: web unit tests pass.

### Task 3 — Frontend: deep-link `/probation?employee=<id>`
**Files**: `ProbationReviewList.tsx`, probation i18n (nếu cần), test mới cho ProbationReviewList

- `useSearchParams`: khi data reviews loaded, consume param `employee` (xoá bằng `setSearchParams`
  replace):
  - review mở (DRAFT/PENDING_HR) của employee → mở scorecard sheet.
  - không có & `can('probation:review')` → mở CreateReviewDialog với `initialEmployeeId`.
- `CreateReviewDialog` thêm prop `initialEmployeeId?: string` (sync khi dialog mở).

**Verify**: unit test cho 2 nhánh deep-link; toàn bộ web tests pass.

### Checkpoint — E2E verification (business outcome)
- Start full stack (`/start`), seed/đảm bảo có manager + report đang PROBATION với
  `probationEndDate` trong ≤7 ngày.
- Login manager → dashboard hiện "Sắp hết thử việc - <tên>" → click → `/probation` mở dialog
  preselected đúng nhân viên → tạo review thành công → mở scorecard.
- Screenshot làm bằng chứng. Test cả light/dark nếu UI thay đổi đáng kể.

## Risks
- Chữ ký `deriveUpcomingEvents` đổi → phải sửa hết test cũ gọi positional `includeLifecycle`.
- Param consume + data async: chỉ xử lý sau khi `isLoading` xong, tránh race mở dialog trống.
- MANAGER không có `employees:view`? → kiểm tra permission matrix; nếu có thì birthday vẫn click được.
