# SPEC-034: Dashboard Upcoming Events — Clickable Links

## Objective

Biến các sự kiện trong widget "Sự kiện sắp tới" trên Dashboard thành link hành động: click vào
sự kiện "Sắp hết thử việc" sẽ đưa người đánh giá (Manager/HR) thẳng tới màn hình đánh giá probation
cho đúng nhân viên đó; các sự kiện khác link tới hồ sơ nhân viên.

## Target Users

- **MANAGER**: thấy sự kiện "Sắp hết thử việc" của direct reports trên dashboard (hiện tại KHÔNG thấy
  — lifecycle events chỉ trả cho company scope), click để tạo/tiếp tục đánh giá.
- **HR_MANAGER / SUPER_ADMIN**: như hiện tại, thêm khả năng click để đi tới đánh giá hoặc hồ sơ.
- **EMPLOYEE**: không đổi (không có lifecycle events; sự kiện sinh nhật/kỷ niệm không click được nếu
  không có quyền `employees:view`).

## Core Features

### 1. Backend — thêm `employeeId` vào `DashboardEvent`
- `DashboardEvent` (packages/shared) thêm field bắt buộc `employeeId: string`.
- `dashboard.repository.findEventSourceEmployees` select thêm `id`.
- **Acceptance**: response `GET /api/v1/dashboard` có `upcomingEvents[].employeeId` đúng với nhân viên.

### 2. Backend — probation_ending cho team scope (MANAGER)
- `deriveUpcomingEvents` đổi cờ `includeLifecycle: boolean` thành options
  `{ probation?: boolean; contract?: boolean; probationExcludeEmployeeId?: string }`.
- Company scope: probation + contract (như cũ).
- Team scope: **probation only**, loại trừ chính manager (`probationExcludeEmployeeId = scope.employeeId`)
  — probation của manager là việc của cấp trên họ; contract_expiring vẫn là việc của HR, không trả cho team scope.
- Self scope: không lifecycle (như cũ).
- **Acceptance**: MANAGER có direct report với `probationEndDate` trong 7 ngày tới sẽ thấy sự kiện
  `probation_ending` kèm `employeeId`; không thấy probation của chính mình; không thấy `contract_expiring`.

### 3. Frontend — event item clickable + điều hướng
- `probation_ending` → nếu `can('probation:view')` → navigate `/probation?employee={employeeId}`.
- `birthday` / `anniversary` / `new_joiner` / `contract_expiring` → nếu `can('employees:view')`
  → navigate `/employees/{employeeId}`.
- Không đủ quyền → render tĩnh như hiện tại (không cursor-pointer, không hover state).
- Item clickable render dạng `<button>` full-width: `hover:bg-surface-alt`, `focus-visible:ring-2
  focus-visible:ring-primary/40`, có thể Tab + Enter (a11y), `transition-colors duration-100`.
- **Acceptance**: click probation event đi tới trang probation; click sự kiện khác đi tới profile;
  user thiếu quyền không click được.

### 4. Frontend — deep-link `/probation?employee={id}`
- `ProbationReviewList` đọc query param `employee` (useSearchParams):
  - Nếu tồn tại review **đang mở** (DRAFT / PENDING_HR) của nhân viên đó → mở `ProbationScorecardSheet`
    cho review đó.
  - Nếu chưa có review mở và `can('probation:review')` → mở `CreateReviewDialog` với nhân viên
    **được chọn sẵn** (preselected, vẫn đổi được).
  - Param được consume một lần rồi xoá khỏi URL (replace) — đóng dialog không tự mở lại.
- `CreateReviewDialog` nhận prop `initialEmployeeId`.
- **Acceptance**: từ dashboard, manager click sự kiện probation của nhân viên A → tới `/probation`,
  dialog tạo review mở sẵn với A được chọn; nếu A đã có review DRAFT → scorecard sheet mở thẳng.

## Out of Scope

- "View calendar" link trên header widget (vẫn placeholder).
- Trang calendar sự kiện riêng.
- Notification/reminder engine (đã có SPEC-017).
- Tự động tạo review khi click (vẫn cần user bấm xác nhận trong dialog).

## Technical Approach

- **Types**: `packages/shared/src/types/dashboard.ts` — `DashboardEvent.employeeId: string`.
- **API**: không endpoint mới; chỉ mở rộng payload + scope logic trong `dashboard.service.ts`.
- **RBAC**: server vẫn là boundary — `probation:review` đã guard `POST /probation/reviews`, scope
  team đã được validate server-side khi tạo review. UI `can()` chỉ là UX.
- **Routing**: query param (không route mới), `useSearchParams` + `navigate`.

## Testing Strategy

- **Unit (API)**: `deriveUpcomingEvents` — các case lifecycle options mới (team probation, exclude self,
  no contract), employeeId có mặt trong mọi event.
- **Integration/Service**: dashboard service trả probation_ending cho MANAGER team scope.
- **E2E/UI verify**: đăng nhập manager → dashboard hiện event probation của report → click → dialog
  tạo review preselected đúng nhân viên (kiểm chứng bằng preview + screenshot, business outcome
  không phải coverage%).

## Boundaries

### Always Do
- Giữ nguyên hành vi company scope hiện có (probation 7 ngày, contract 30 ngày).
- i18n cho mọi text mới; token màu/spacing theo design system.
- Cập nhật test hiện có của `deriveUpcomingEvents` theo chữ ký mới.

### Ask First
- Mở rộng `contract_expiring` cho team scope (hiện giữ company-only).

### Never Do
- Không nới quyền server-side (không cho MANAGER thấy lifecycle ngoài team).
- Không commit (theo quy ước làm việc hiện tại).
