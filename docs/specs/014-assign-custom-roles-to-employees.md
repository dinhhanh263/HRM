# SPEC-014: Gán role tùy chỉnh cho nhân viên

**Status:** Draft (discovery 2026-06-03)
**Created:** 2026-06-03
**Author:** Claude + Hạnh
**Depends on:** SPEC-003 (Authorization/RBAC), SPEC-012 (Payroll Approval), SPEC-013 (Flexible Payroll Approvers)

---

## Objective

Cho phép SUPER_ADMIN gán **bất kỳ role nào của tenant** (role hệ thống *và* role tùy
chỉnh) cho nhân viên qua form nhân viên — thay vì chỉ chọn được 4 role enum cứng. Nhờ
đó người duyệt lương cấp cao (Giám đốc / Kế toán trưởng) có thể được tạo thành một role
tùy chỉnh mang `payroll:approve` **cộng** các quyền giám sát khác, không bị bó hẹp chỉ ở
phê duyệt lương.

## Vấn đề với hiện trạng

- Mỗi nhân viên giữ **một** `user.roleId` (FK tới `Role`). RBAC đọc quyền từ `roleId`.
- Tính năng quản lý role tùy chỉnh **đã tồn tại** (`/roles`: RoleFormSheet + PermissionMatrix,
  API `role.routes.ts`, schema `Role`/`RolePermission`) — SUPER_ADMIN tạo được role với bộ
  quyền bất kỳ.
- **Khúc đứt gãy:** form nhân viên chỉ cho chọn 4 enum cứng
  (`AssignableEmployeeRole = EMPLOYEE | MANAGER | HR_MANAGER | PAYROLL_APPROVER`,
  [employee.ts:32](../../packages/shared/src/types/employee.ts)). Service map enum → roleId
  ([employee.service.ts:21-27](../../apps/api/src/domain/services/employee.service.ts)). Role
  tùy chỉnh tạo ra **không gán được** cho nhân viên.
- Role hệ thống "Phê duyệt lương" cố ý hẹp (`dashboard:view`, `payroll:view`, `payroll:approve`
  — [catalog.ts:51-54](../../apps/api/src/domain/rbac/catalog.ts)) để giữ SoD, nên gán nó là
  mất hết quyền khác → bất tiện cho người dùng cấp cao.

## Target Users

| User | Actions |
|------|---------|
| **Super Admin** | Tạo role tùy chỉnh + **gán bất kỳ role tenant** (trừ `super_admin`) cho nhân viên |
| **HR Manager / khác** | Không đổi — KHÔNG gán/đổi role (field role bị bỏ qua server-side) |
| **Người được gán role tùy chỉnh** | Có đúng bộ quyền của role đó (RBAC từ `roleId`) |

---

## Quyết định kiến trúc (chốt trước khi build)

### Đ1. Khóa gán role chuyển từ enum → `roleId`
Create/Update employee nhận `roleId` (cuid của một `Role` thuộc tenant) làm khóa gán
role chính thức, thay cho `role` enum. Service xác thực `roleId` thuộc tenant rồi gán
thẳng `user.roleId`.

### Đ2. Đồng bộ cột enum `user.role` cũ (không bỏ enum)
Cột `user.role` (Prisma enum `UserRole`) **không** biểu diễn được role tùy chỉnh nhưng
vẫn còn được dùng vài nơi. Quy tắc đồng bộ khi gán `roleId`:
- roleId trỏ tới **role hệ thống** (`key` ∈ {employee, manager, hr_manager, payroll_approver, super_admin})
  → set enum tương ứng (giữ nguyên hành vi hiện tại).
- roleId trỏ tới **role tùy chỉnh** → set enum = `EMPLOYEE` (giá trị nền trung tính).

**Hệ quả (boundary, chấp nhận ở v1):** các nhánh *scoping theo enum* sẽ coi người giữ
role tùy chỉnh như `EMPLOYEE`:
- **Payroll** — KHÔNG ảnh hưởng: scoping đã dựa trên **permission** từ `roleId`
  (`callerCanProcess` đọc `payroll:process`/`payroll:approve` qua `permissionService`,
  [payroll.controller.ts:11-22](../../apps/api/src/app/controllers/payroll.controller.ts)).
  Đây là module trọng tâm của tính năng → mục tiêu chính đạt được.
- **Leave / Timesheet / Dashboard layout** — dùng enum cho phạm vi HR/Manager
  ([dashboard.service.ts:117-125](../../apps/api/src/domain/services/dashboard.service.ts),
  leave/timesheet controller). Người giữ role tùy chỉnh được scope như EMPLOYEE ở các
  module này; quyền truy cập màn hình vẫn đúng theo permission. Tinh chỉnh sâu hơn để các
  module này cũng permission-based là **out of scope** (việc riêng).

### Đ3. SoD & chống leo thang giữ nguyên
- Gán role vẫn **chỉ SUPER_ADMIN** (`canAssignRole`,
  [employee.controller.ts:8-9](../../apps/api/src/app/controllers/employee.controller.ts)).
  Caller khác gửi `roleId` → bị bỏ qua, nhân viên mới nhận role mặc định `employee`.
- Role `super_admin` **không** nằm trong danh sách gán được (không leo thang qua form NV).
- Trách nhiệm tách bạch maker-checker khi *soạn* role (không để 1 role vừa `payroll:process`
  vừa `payroll:approve`) thuộc về SUPER_ADMIN lúc tạo role ở trang `/roles`. Cảnh báo tại
  RoleFormSheet là **out of scope** spec này.

---

## Core Features

### 1. API nhận `roleId` khi tạo/sửa nhân viên
**Acceptance Criteria:**
- [ ] `createEmployeeSchema` / `updateEmployeeSchema` thêm `roleId: z.string().cuid().optional()`
- [ ] Service `create`/`update`: nếu `canAssignRole` và có `roleId` → xác thực Role thuộc tenant
      (404/400 nếu không), gán `user.roleId`, set enum theo Đ2; nếu không có `roleId` → giữ
      hành vi mặc định (`employee`).
- [ ] Caller không phải SUPER_ADMIN gửi `roleId` → bị bỏ qua (regression test).
- [ ] Gửi `roleId` của role `super_admin` → từ chối (BadRequest), không gán được.

### 2. Endpoint cấp danh sách role gán được cho form
**Acceptance Criteria:**
- [ ] Form lấy role qua `useRoles()` (GET `/roles`, đã có) — không cần endpoint mới.
- [ ] Lọc bỏ `super_admin` khỏi danh sách hiển thị.
- [ ] Quyền xem: SUPER_ADMIN có `roles:view` (wildcard) → gọi được.

### 3. Form nhân viên: chọn role thật (system + custom)
**Acceptance Criteria:**
- [ ] `EmployeeForm` đổi Select role: option = role từ `useRoles()` (value = `role.id`,
      label = `role.name`), thay cho 4 enum cứng.
- [ ] Chỉ render khi `canAssignRole` (SUPER_ADMIN) — giữ guard UX hiện tại.
- [ ] Prefill khi sửa: chọn sẵn `employee.user.roleId`.
- [ ] CreateEmployeePage / EditEmployeePage gửi `roleId` trong request payload.
- [ ] Shared types: `CreateEmployeeRequest` / `UpdateEmployeeRequest` thêm `roleId?: string`;
      `EmployeeDto.user` thêm `roleId` (+ `roleName` để hiển thị ở EmployeeDetailPage).

### 4. i18n
**Acceptance Criteria:**
- [ ] Nhãn field role giữ key cũ (`form.role` = "Vai trò"); placeholder "Chọn vai trò".
      Tên role lấy từ dữ liệu (role.name) — không cần key i18n cho role tùy chỉnh.

---

## Out of Scope
- Multi-role per user (giữ một `roleId`).
- Bỏ cột enum `user.role` cũ.
- Chuyển leave/timesheet/dashboard sang scoping thuần permission.
- Cảnh báo SoD khi soạn role có cả `payroll:process` + `payroll:approve`.

## Testing Strategy
- **API unit/integration:** create/update với `roleId` hợp lệ (system + custom) → `user.roleId`
  đúng, enum theo Đ2; non-admin bị bỏ qua; `super_admin` bị từ chối; roleId khác tenant → lỗi.
- **Web:** EmployeeForm render option từ useRoles, prefill roleId, submit gửi roleId; SoD ẩn
  control cho non-admin (giữ test cũ).
- Regression: giữ test 422 empty-string (SPEC-013) xanh.

## Boundaries
- **Always:** server enforce SUPER_ADMIN-only; xác thực roleId thuộc tenant; RBAC từ roleId.
- **Ask first:** thay đổi semantics cột enum cũ ngoài Đ2.
- **Never:** cho gán `super_admin` qua form; cho non-admin đổi role.
