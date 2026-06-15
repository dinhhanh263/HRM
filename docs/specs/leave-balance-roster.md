# Feature: Leave Balance Roster (Tổng quan số dư phép toàn công ty)

## Objective
Cung cấp một màn hình duy nhất cho phép HR (và Manager theo phạm vi team) xem số dư phép
của **nhiều nhân viên cùng lúc** — mỗi dòng một nhân viên, mỗi cột một loại phép — thay vì
phải mở từng trang chi tiết nhân viên một.

## Target Users
- **HR_MANAGER / SUPER_ADMIN** — xem toàn bộ nhân viên đang hoạt động của công ty.
- **MANAGER** — xem nhân viên trong team mình (bản thân + direct reports), dùng lại đúng
  định nghĩa scope của danh bạ nhân viên (`employeeService.getAll`).
- EMPLOYEE: không truy cập màn hình này (đã có số dư của mình ở trang Nghỉ phép).

## Core Features
1. **Bảng roster** — mỗi dòng 1 nhân viên (avatar, tên, mã NV, phòng ban); mỗi loại phép
   đang hoạt động là 1 cột.
   - *AC:* Mỗi ô hiển thị **Còn lại / Đã dùng / Chờ duyệt** (3 số), căn phải, `tabular-nums`.
     Số "còn lại" là điểm nhấn; "đã dùng" và "chờ duyệt" mờ hơn.
   - *AC:* Số liệu khớp chính xác với phép tính ở [leave-balance.service.ts](../../apps/api/src/domain/services/leave-balance.service.ts):
     `remaining = allocated − used − pending`, trong đó `allocated` lấy override theo
     nhân viên/năm nếu có, ngược lại `defaultDays` của loại phép.
2. **Chọn năm** — điều hướng ◀ năm ▶ (mặc định năm hiện tại, UTC).
   - *AC:* Đổi năm refetch dữ liệu đúng năm đó.
3. **Lọc theo phòng ban** + **tìm kiếm** (tên / mã NV, debounce 300ms, bỏ dấu/hoa-thường
   theo hành vi search hiện có ở backend).
   - *AC:* Lọc + tìm kiếm chạy server-side; phân trang server-side.
4. **Phạm vi nhân viên: chỉ ACTIVE** — loại bỏ nhân viên đã nghỉ việc/terminated.
5. **Xuất Excel** — nút "Xuất Excel" tạo file `.xlsx` server-side (dùng `exceljs` đã có),
   **tôn trọng filter hiện tại** (năm + phòng ban + search + scope theo role).
   - *AC:* File có header là các loại phép; mỗi nhân viên 1 dòng; số liệu trùng với bảng.
6. **Lối vào riêng** — route `/leave/balances`, có mục trong sidebar (nhóm "Quản lý"),
   chỉ hiển thị khi người dùng có review capability.

## Out of Scope
- Chỉnh sửa/override allocation từ màn hình roster (vẫn làm ở trang chi tiết nhân viên qua
  `EmployeeLeaveBalances` — tránh trùng chức năng). Roster là **read-only**.
- Lịch sử đơn nghỉ chi tiết / drill-down timeline (đã có ở trang Nghỉ phép).
- Hiển thị nhân viên đã nghỉ việc (xem Out of scope phạm vi ACTIVE ở trên).
- Tính năng AI/insight.

## Technical Approach

### Backend
- **Route mới** trong [leave.routes.ts](../../apps/api/src/app/routes/v1/leave.routes.ts):
  - `GET /leave/balances/roster` — `requirePermission('leave:view')` + trong controller gọi
    `requireReviewCapability(req)` (đọc số dư người khác → cần review capability, đúng pattern
    `getBalances` khi có `employeeId`).
  - `GET /leave/balances/roster/export` — cùng guard, trả `.xlsx` stream.
- **Scope nhân viên**: tái dùng `employeeService.getAll(tenantId, { status: ACTIVE, departmentId, search }, pagination, requester)`
  để lấy danh sách nhân viên đã được row-level-scoped theo role (HR=all, MANAGER=team).
  Không viết lại logic scope.
- **Service mới** `leaveBalanceService.getRosterBalances(tenantId, employeeIds, year)` — gom
  batch, **tránh N+1** với đúng 3 query bất kể số nhân viên:
  1. `leaveTypeRepository.findAll(tenantId, { activeOnly: true })` — các loại phép.
  2. `leaveBalanceRepository.findManyForEmployeesYear(employeeIds, year)` (repo method mới:
     `findMany({ where: { employeeId: { in: ids }, year } })`) — override allocation.
  3. `leaveRequestRepository.aggregateDaysByStatusForEmployees(employeeIds, year)` (repo method
     mới: `groupBy({ by: ['employeeId','leaveTypeId','status'], ... })`) — used/pending.
  Lắp ráp trong memory thành `{ employeeId → (leaveTypeId → {allocated,used,pending,remaining}) }`.
- **Tổng query mỗi request**: 1 (đếm/list nhân viên) + 3 = hằng số, không scale theo N.

### Data / API contract
```
GET /leave/balances/roster?year=2026&departmentId=&search=&page=1&limit=20
→ {
  success: true,
  data: [
    {
      employee: { id, fullName, employeeCode, avatarUrl, departmentName },
      balances: [
        { leaveTypeId, leaveTypeName, leaveTypeCode, colorHex, paid,
          allocated, used, pending, remaining }
      ]
    }
  ],
  leaveTypes: [ { id, name, code, colorHex, paid } ],  // thứ tự cột ổn định
  pagination: { page, limit, total, totalPages }
}
```
- DTO mới trong `@hrm/shared`: `LeaveBalanceRosterRowDto`, `LeaveBalanceRosterResponse`.
- Excel endpoint trả `Content-Type: application/vnd.openxmlformats-...sheet` + `Content-Disposition`.

### Frontend
- **Route** `/leave/balances` (page riêng), thêm nav item (nhóm "Quản lý"), bọc route guard
  + `Can` theo review capability.
- **Hook** `useLeaveBalanceRoster({ year, departmentId, search, page })` (TanStack Query,
  `staleTime: 30s`), `useExportLeaveRoster()` (tải blob).
- **UI** theo design system + `ui-modern.md`: TanStack Table, sticky header, freeze cột tên,
  toolbar (year selector, department filter, search debounce 300ms, export), skeleton khi load,
  empty state có nội dung phù hợp, `tabular-nums` cho mọi số.

## Code Style
- Tuân theo `.claude/rules/` (TypeScript strict, kebab-case file, REST conventions,
  error-handling AppError, naming-conventions).
- Token màu/spacing theo CLAUDE.md + ui-modern.md (Tailwind v4 `@theme`, dark mode `.dark`).
- i18n: thêm key vào `locales/{vi,en}/leave.json`, không hardcode text.

## Testing Strategy
- **Unit (Vitest)** — `getRosterBalances`: override thắng defaultDays; remaining = allocated−used−pending;
  pending tách khỏi used; nhân viên không có đơn → used/pending = 0.
- **Integration (Supertest)** — endpoint:
  - HR_MANAGER thấy toàn bộ nhân viên ACTIVE; MANAGER chỉ thấy team; EMPLOYEE/không-review → 403.
  - Filter departmentId + search hoạt động; phân trang đúng.
  - Export trả đúng content-type `.xlsx`.
- **E2E (Playwright) — critical path, assert business outcome**: seed đủ trạng thái (2 nhân viên,
  1 loại phép có allocation, 1 đơn APPROVED + 1 đơn PENDING) → đăng nhập HR → vào `/leave/balances`
  → **khẳng định ô số dư hiển thị đúng còn lại/đã dùng/chờ duyệt phản ánh seed** (không chỉ check
  trang render). Lọc theo phòng ban → đúng tập nhân viên. Bấm Xuất → tải được file.

## Boundaries
### Always Do
- RBAC end-to-end: `requirePermission` + `requireReviewCapability` ở backend là bắt buộc;
  ẩn UI chỉ là UX.
- MANAGER bị giới hạn đúng team qua `employeeService` (security boundary ở service).
- Tránh N+1: query hằng số cho roster.
- Test critical-path E2E khẳng định kết quả nghiệp vụ trước khi báo hoàn thành.

### Ask First
- Nếu phát sinh nhu cầu thêm cột "tổng đã cấp" / đổi đơn vị (ngày → giờ).
- Nếu muốn cho phép chỉnh allocation ngay trên roster (hiện đang Out of scope).

### Never Do
- Không cho EMPLOYEE xem số dư người khác.
- Không hardcode màu/text; không commit (làm việc local).
- Không nới scope MANAGER ra ngoài team.

## Next Step
Sau khi spec được duyệt → chạy `/plan` để tách thành các vertical slice nhỏ, có thứ tự phụ thuộc.
