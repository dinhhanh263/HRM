# Plan: SPEC-014 — Gán role tùy chỉnh cho nhân viên (Hướng B)

> Spec: `docs/specs/014-assign-custom-roles-to-employees.md`
> Mục tiêu: SUPER_ADMIN gán **bất kỳ role tenant** (system + custom) cho nhân viên qua
> form NV bằng `roleId`, thay cho 4 enum cứng. Người duyệt lương cấp cao có thể là một
> role tùy chỉnh giàu quyền.

## Khảo sát (read-only) — đã xong

- **Khóa gán hiện tại = enum `role`.** Validator `employee.validator.ts` có `roleEnum`
  (4 giá trị); service `resolveRoleId(tenantId, role)` map enum→key→`roleRepository.findByKey`.
- **`user.roleId`** là cột RBAC đọc quyền; `user.role` (enum) là legacy nhưng vẫn dùng vài nơi
  (SUPER_ADMIN fast-path, leave/timesheet/dashboard scoping, hiển thị).
- **Custom-role UI đã có** (`/roles`, `useRoles()` → GET `/roles` trả `RoleListItemDto[]`
  `{id,key,name,isSystem,...}`). Quyền `roles:view` (SUPER_ADMIN có wildcard).
- **Prisma `User`**: `role UserRole`, `roleId String?`, relation `roleRef Role?`.
- **Payroll scoping = permission-based** (`payroll:approve`/`payroll:process` qua roleId) →
  KHÔNG ảnh hưởng bởi Đ2. Leave/timesheet/dashboard vẫn dùng enum → custom role bị scope như
  EMPLOYEE (boundary chấp nhận ở v1).
- **Controller** `canAssignRole(req) = req.user.role === SUPER_ADMIN`, truyền vào create/update.
- **Tests hiện có** (`tests/integration/employee.test.ts`) phụ thuộc nặng vào path enum `role`
  (HR_MANAGER/PAYROLL_APPROVER/EMPLOYEE). Import path cũng dùng enum.

## Quyết định triển khai (bám spec Đ1–Đ3)

- **D-A. roleId ưu tiên, KHÔNG bỏ path enum.** Service nhận cả `roleId` (mới, ưu tiên) và `role`
  (legacy, cho import + test cũ). Thứ tự: `roleId` → `role` enum → default `EMPLOYEE`. Giữ test
  cũ xanh, không vỡ import. (Bỏ hẳn enum-input là Out of Scope.)
- **D-B. Đồng bộ enum theo Đ2.** Helper `userRoleForRoleKey(key)`: key ∈ system → enum tương ứng;
  custom → `EMPLOYEE`. Set cả `user.role` + `user.roleId`.
- **D-C. Chặn leo thang.** roleId trỏ `super_admin` → `BadRequestError`. roleId khác tenant →
  `BadRequestError` (findById đã where theo tenantId). Non-admin gửi roleId → bỏ qua (như role).
- **D-D. Expose roleId + roleName** trên `EmployeeDto.user` để form prefill + detail hiển thị.

## Vertical slices

### Slice 1 — API nhận & xác thực `roleId` (create/update)  [RISK-FIRST]
**Files:**
- `apps/api/src/domain/rbac/catalog.ts` — thêm `userRoleForRoleKey(key): UserRole`.
- `apps/api/src/app/validators/employee.validator.ts` — `roleId: z.string().cuid().optional()`
  (cả create + update).
- `packages/shared/src/types/employee.ts` — `roleId?: string` trên Create/Update request.
- `apps/api/src/domain/services/employee.service.ts` — input `roleId?`; helper
  `resolveRoleAssignment(tenantId, roleId)` (validate tenant + reject super_admin + derive enum);
  wire vào create/update với thứ tự ưu tiên roleId→role→EMPLOYEE.
**AC:** system roleId → `user.roleId`+enum đúng; custom roleId → enum EMPLOYEE; super_admin roleId
  → 400; roleId khác tenant → 400; non-admin gửi roleId → bỏ qua; path enum cũ vẫn chạy.
**Tests:** thêm describe `assign by roleId (custom roles)` trong `employee.test.ts`.

### Slice 2 — Expose `roleId`/`roleName` trên EmployeeDto.user
**Files:**
- `apps/api/src/domain/repositories/employee.repository.ts` — thêm `roleId` + `roleRef:{select:{name}}`
  vào user-select (ít nhất findById; đồng bộ findAll/create/update cho nhất quán).
- `packages/shared/src/types/employee.ts` — `EmployeeUserDto` thêm `roleId: string | null` và
  `roleName?: string | null` (map từ roleRef.name) **hoặc** `roleRef?: {name}|null`.
**AC:** GET `/employees/:id` trả `user.roleId` + tên role; FE prefill được.
**Tests:** assert `user.roleId` xuất hiện trong GET detail (employee.test.ts).

### Slice 3 — Form chọn role thật (system + custom), gửi roleId
**Files:**
- `apps/web/src/features/employees/components/EmployeeForm.tsx` — Select role dùng `useRoles()`
  (lọc bỏ `super_admin`), value=`role.id`, label=`role.name`; schema `roleId` thay `role`;
  prefill `employee.user?.roleId`.
- `apps/web/src/features/employees/pages/EditEmployeePage.tsx` — onSubmit gửi `roleId`.
- `apps/web/src/features/employees/pages/CreateEmployeePage.tsx` — Select role từ `useRoles()`,
  Controller `name="roleId"`, gửi `roleId`.
- Cập nhật test: `CreateEmployeePage.test.tsx` + `EditEmployeePage.test.tsx` mock `useRoles`.
**AC:** render option từ useRoles (ẩn super_admin); chỉ render khi canAssignRole; prefill đúng;
  submit gửi roleId; giữ test SoD ẩn control non-admin; giữ regression 422 empty-string.

### Slice 4 — i18n + polish + regression
**Files:** `apps/web/src/locales/{vi,en}/employee.json` — giữ `form.role`,
  `form.placeholders.selectRole`. Tên role lấy từ dữ liệu (không cần key cho custom).
**AC:** label/placeholder đúng; toàn bộ test API + web xanh; build pass.

## Checkpoints
- **CP1 (sau Slice 1):** API test xanh; super_admin/cross-tenant bị từ chối; path enum cũ còn chạy.
- **CP2 (sau Slice 3):** FE build + web test xanh; verify trên browser bằng tài khoản SUPER_ADMIN.
- **CP3 (sau Slice 4):** full `pnpm test` xanh; design checklist; KHÔNG commit/ship khi chưa được lệnh.

## Boundaries
- **Always:** server enforce SUPER_ADMIN-only; validate roleId thuộc tenant; RBAC từ roleId.
- **Never:** gán `super_admin` qua form; non-admin đổi role; bỏ cột enum; đổi semantics enum ngoài Đ2.
