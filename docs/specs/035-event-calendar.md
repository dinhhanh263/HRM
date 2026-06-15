# SPEC-035: Event Calendar — Trang lịch sự kiện

## Objective

Làm link "Xem lịch" trên widget "Sự kiện sắp tới" hoạt động thật: trang `/calendar` hiển thị
month-grid các sự kiện nhân sự (sinh nhật, kỷ niệm, nhân viên mới, hết thử việc, hết hạn HĐ)
kèm ngày lễ, điều hướng được tháng trước/sau, click sự kiện deep-link như SPEC-034.

## Target Users

- **HR_MANAGER / SUPER_ADMIN**: nhìn toàn cảnh sự kiện công ty theo tháng (gồm lifecycle).
- **MANAGER**: lịch sự kiện của team (gồm hết thử việc của reports — SPEC-034 scope).
- **EMPLOYEE**: sự kiện trong scope của mình + ngày lễ công ty.

## Core Features

### 1. Backend — `GET /api/v1/dashboard/events?month=YYYY-MM`
- Guard `dashboard:view` (route mới trong `dashboard.routes.ts`).
- Validate `month` bằng Zod (`/^\d{4}-(0[1-9]|1[0-2])$/`); thiếu/sai → 422 VALIDATION_ERROR.
  Mặc định khi thiếu: không default — bắt buộc có `month` (client luôn gửi).
- **Scope rules tái dùng nguyên xi** từ dashboard (`resolveScope` + `lifecycleOptions` SPEC-034):
  company = mọi sự kiện; team = recurring của team + probation của reports (không của chính
  manager, không contract); self = recurring của mình.
- Hàm pure mới `deriveMonthEvents(employees, monthKey, lifecycle)`:
  - Khác `deriveUpcomingEvents` về ngữ nghĩa cửa sổ: **sự kiện rơi trong tháng** (không phải
    lead window 7/30 ngày). Membership so theo ISO date string `startsWith(monthKey)` —
    recurring dùng `toISODate` (server-local như hiện tại), lifecycle dùng `ictISODate`
    (khớp reminder engine).
  - Birthday/anniversary: occurrence của năm thuộc `monthKey` (anniversary cần years >= 1).
- Response `CalendarMonthData` (shared type mới):
  ```ts
  interface CalendarMonthData {
    month: string;            // YYYY-MM
    events: DashboardEvent[]; // đã có employeeId (SPEC-034)
    holidays: HolidayDto[];   // ngày lễ trong tháng (tenant-wide)
  }
  ```
- Holidays lấy qua `holidayService.listByYear` rồi lọc theo tháng — ngày lễ là thông tin
  công khai trong tenant, hợp lệ với mọi `dashboard:view`.
- **Acceptance**: HR thấy đủ 5 loại event trong tháng + holidays; MANAGER thấy recurring team
  + probation reports (không contract, không probation của chính mình); EMPLOYEE chỉ recurring
  của mình + holidays; `month` sai format → 422.

### 2. Frontend — trang `/calendar`
- Route `/calendar`, permission `dashboard:view`, page `CalendarPage`
  (`features/calendar/`), lazy-load theo pattern router hiện tại.
- Hook `useCalendarEvents(month)` → TanStack Query, key `['calendar-events', month]`,
  staleTime 30s, giữ data cũ khi chuyển tháng (placeholderData) để không giật.
- **Month grid** (`EventCalendar` component): 7 cột thứ Hai-đầu (khớp AttendanceCalendar),
  ô ngày hiện: số ngày, tên ngày lễ (nền `bg-primary/5`), tối đa ~3 chip sự kiện + "+N" khi
  tràn; ngày hôm nay được đánh dấu (ring/token primary). Số dùng `tabular-nums`.
- Chip sự kiện: icon + màu theo `EVENT_STYLE` (extract từ DashboardPage ra module dùng chung
  `features/dashboard/event-style.ts` — không duplicate).
- Click chip → deep-link **y hệt SPEC-034** (extract hook dùng chung `useEventNavigation`:
  probation_ending → `/probation?employee=` nếu `probation:view`; còn lại → `/employees/:id`
  nếu `employees:view`; thiếu quyền → chip tĩnh).
- Header trang: tiêu đề tháng (định dạng theo locale), nút ‹ › chuyển tháng, nút "Hôm nay".
- States: skeleton grid khi load lần đầu; error alert; tháng không sự kiện vẫn render grid.
- A11y: chip là button có accessible name; điều hướng tháng bằng keyboard; tôn trọng
  `prefers-reduced-motion` (đã global).
- **Acceptance**: sự kiện hiện đúng ô ngày; chuyển tháng tải đúng dữ liệu; click chip điều
  hướng đúng; responsive 768–1440; dark mode ổn.

### 3. Dashboard — nút "Xem lịch"
- `onClick={() => navigate('/calendar')}` thay placeholder.
- **Acceptance**: từ Dashboard click "Xem lịch" → `/calendar` của tháng hiện tại.

## Out of Scope

- Đơn nghỉ đã duyệt / chấm công trên lịch (phase 2).
- Sidebar nav item riêng cho Calendar (vào qua Dashboard; cân nhắc sau).
- Tuần view / ngày view; export iCal; chỉnh sửa sự kiện từ lịch.
- Permission key mới (`dashboard:view` là đủ).

## Technical Approach

- Không bảng DB mới — events derive từ employees/contracts như dashboard; holidays đã có.
- `deriveMonthEvents` là pure function cạnh `deriveUpcomingEvents` (cùng file service) —
  chấp nhận hai hàm vì ngữ nghĩa cửa sổ khác nhau (lead window vs in-month), share helper.
- N+1: 1 query employees (sẵn có) + 1 query holidays.
- FE dùng native Date (project không có date-fns; không thêm dependency).

## Testing Strategy

- **Unit (API)**: `deriveMonthEvents` — occurrence đúng tháng/năm, anniversary years,
  ranh giới tháng (ngày 1 & cuối tháng, ICT edge cho lifecycle), lifecycle options per scope.
- **Integration (API)**: endpoint per role (HR/MANAGER/EMPLOYEE) + holidays + 422 month sai
  + 403 thiếu permission.
- **Unit (Web)**: EventCalendar đặt event đúng ô; CalendarPage điều hướng tháng; click chip
  navigate đúng; gating quyền.
- **E2E verify**: login manager → Dashboard → "Xem lịch" → thấy probation event của report
  trong grid → click → scorecard/dialog. Screenshot light+dark.

## Boundaries

### Always Do
- Scope phải resolve server-side từ actor (không tin client).
- i18n vi+en cho mọi text mới; token màu/spacing; không hex.
- Extract dùng chung (EVENT_STYLE, eventTarget) thay vì copy.

### Ask First
- Thêm sidebar nav item cho Calendar.
- Đưa leave đã duyệt lên lịch (phase 2).

### Never Do
- Không expose event ngoài scope của actor.
- Không commit.
