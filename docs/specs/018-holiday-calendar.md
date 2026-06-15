# Feature: Holiday Calendar — Quản lý ngày nghỉ lễ/Tết (BLLĐ 2019)

## Objective
Cung cấp giao diện để HR thiết lập danh sách ngày nghỉ lễ/Tết theo luật lao động VN. Những ngày này
vẫn được trả lương dù nhân viên không chấm công, và dùng để phân loại tăng ca ngày lễ. Backend cho
việc này đã tồn tại và đã chạy đúng — feature này chủ yếu **gắn UI đã-build-sẵn vào ứng dụng** và bổ
sung khả năng **nạp nhanh ngày lễ chuẩn theo năm**.

## Target Users
- **HR_MANAGER / SUPER_ADMIN** (`timesheet:configure`): tạo/sửa/xoá ngày lễ, nạp lễ chuẩn theo năm.
- **Mọi vai trò** (`timesheet:view`): xem được danh sách ngày lễ (đã dùng ở calendar chấm công).

## Bối cảnh — những gì ĐÃ có (không build lại)
- **Model `Holiday`** + migration: `{ tenantId, date, name, recurring, @@unique([tenantId,date]) }`.
- **CRUD API** đã wired tại `timesheet.routes.ts`:
  - `GET /timesheet/holidays?year=` → `timesheet:view`
  - `POST /timesheet/holidays` → `timesheet:configure`
  - `PATCH /timesheet/holidays/:id` → `timesheet:configure`
  - `DELETE /timesheet/holidays/:id` → `timesheet:configure`
- **Tính lương đúng**: `summary.helper` loại ngày lễ khỏi `workingDaysInPeriod`; `payslip.engine`
  prorate trên số ngày công đã trừ lễ → nhân viên hưởng đủ lương ngày lễ mà không cần chấm công.
- **Component FE `HolidaySettings.tsx`**: list theo năm, đổi năm, tạo/sửa/xoá (Sheet + AlertDialog),
  RBAC bằng `canConfigure`, i18n vi/en đầy đủ — nhưng **chưa được mount ở route nào**.
- **`PolicySettings.tsx`**: cấu hình policy chấm công, cũng đã build và cũng **mồ côi**.
- **`seedHolidaysForTenant(prisma, tenantId, year)`** trong `holiday-defaults.ts`: idempotent (upsert),
  có lễ dương cố định + Tết/Giỗ Tổ cho 2026–2027 — nhưng **chưa được gọi ở đâu**.

## Core Features

### 1. Trang "Cài đặt chấm công" gom các cấu hình mồ côi
- Route mới `settings/timesheet`, bọc `RequirePermission permission="timesheet:view"`.
- Render `PolicySettings` + `HolidaySettings` (cứu cả 2 component đang không truy cập được).
- **Acceptance**: HR đăng nhập → vào được trang, thấy chính sách + danh sách ngày lễ; nút thêm/sửa/xoá
  chỉ hiện với `timesheet:configure`.

### 2. Nạp nhanh ngày lễ VN theo năm (code mới duy nhất)
- **Backend**: `POST /timesheet/holidays/seed` body `{ year }`, gated `timesheet:configure`, gọi
  `seedHolidaysForTenant`. Idempotent; trả `{ seeded: <số ngày>, year }`.
- **Frontend**: nút "Nạp ngày lễ VN năm 20XX" trong `HolidaySettings` (chỉ `canConfigure`), có
  `AlertDialog` xác nhận (vì ghi đè tên/recurring của ngày trùng), toast kết quả, invalidate query.
- **Acceptance**: HR bấm nạp cho năm đang chọn → danh sách xuất hiện đủ lễ chuẩn; bấm lại không tạo
  trùng (vẫn đúng số ngày); EMPLOYEE không thấy nút và gọi API trả 403.

### 3. Điều hướng
- Thêm mục "Cài đặt chấm công" vào nav nhóm **Hệ thống**, gated `timesheet:view`.
- **Acceptance**: mục hiện trên sidebar cho user có `timesheet:view`; bấm vào mở trang mục 1.

## Out of Scope
- Calendar-grid view cho ngày lễ (giữ list — phù hợp ~10–15 ngày/năm). Làm sau nếu cần.
- Refactor `working-days.helper.ts` để trừ phép năm né ngày lễ → **task riêng**, không nằm trong đợt này.
- Tự động seed khi tạo tenant; nhập từ file; ngày lễ riêng theo công ty/vùng.
- Bù ngày lễ rơi vào cuối tuần (nghỉ bù) — luật cho phép nhưng ngoài phạm vi MVP.

## Technical Approach
- **Backend** (layered, ESM):
  - Validator: `seedHolidaysSchema = z.object({ year: z.number().int().min(2000).max(2100) })`.
  - `holidayService.seed(tenantId, year)` → gọi `seedHolidaysForTenant(db, tenantId, year)`.
  - `timesheetController.seedHolidays` → 200 `{ success, data: { seeded, year } }`.
  - Route: `router.post('/holidays/seed', requirePermission('timesheet:configure'), validate(seedHolidaysSchema), seedHolidays)`.
  - Shared types: `SeedHolidaysRequest { year }`, `SeedHolidaysResult { seeded; year }`.
- **Frontend**:
  - `useSeedHolidays()` mutation → `POST /timesheet/holidays/seed`, invalidate `holidays`.
  - Nút seed + AlertDialog trong `HolidaySettings`.
  - `pages/TimesheetSettingsPage.tsx` (hoặc đặt trong `features/settings`) render Policy + Holiday.
  - Route trong `router.tsx`; nav item trong `Sidebar.tsx`; i18n keys mới.
- **Integration points**: dùng lại toàn bộ repo/mapper/summary/payslip có sẵn — không đụng hợp đồng
  `TimesheetSummaryDto` (STABLE).

## Code Style
- Tuân thủ `.claude/rules/` (api-conventions, security, error-handling, testing) và CLAUDE.md design system.
- Seed phải idempotent; mọi ghi đều gated server-side bằng `requirePermission` (FE chỉ là UX).
- Không hardcode màu/spacing; dùng token; `tabular-nums` cho ngày.

## Testing Strategy
- **Integration (API)** — critical path khẳng định kết quả nghiệp vụ:
  - HR seed năm N → `GET ?year=N` trả đúng tập ngày lễ chuẩn (khẳng định có "Quốc khánh" 02-09, đủ số ngày).
  - Seed lần 2 cùng năm → không tăng số ngày (idempotent).
  - EMPLOYEE gọi `POST /seed` → 403.
  - Validator: `year` thiếu/sai → 422.
- **FE unit**: `HolidaySettings` hiện nút seed khi `canConfigure`, ẩn khi không; mở dialog xác nhận.
- **Live verify**: screenshot trang Cài đặt chấm công (HR) — danh sách lễ sau khi seed, dark + light.

## Boundaries
### Always Do
- Gate mọi thao tác ghi bằng `requirePermission('timesheet:configure')` ở server.
- Giữ seed idempotent (upsert), không phá dữ liệu ngày lễ HR đã sửa tay (chấp nhận ghi đè tên chuẩn — có cảnh báo ở dialog).

### Ask First
- Nếu muốn thêm calendar-grid hoặc nghỉ bù → quay lại spec.
- Nếu muốn đổi nơi mount (tab trong TimesheetPage thay vì trang settings riêng).

### Never Do
- Không tự seed ngầm khi load trang (chỉ seed khi HR bấm).
- Không commit khi chưa được yêu cầu rõ ràng.
- Không đổi shape `TimesheetSummaryDto`.
