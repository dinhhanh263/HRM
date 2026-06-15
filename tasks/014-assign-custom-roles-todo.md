# TODO: SPEC-014 — Gán role tùy chỉnh cho nhân viên (Hướng B)

## Slice 1: API nhận & xác thực roleId (create/update)
- [x] catalog.ts: `userRoleForRoleKey(key): UserRole` (system→enum, custom→EMPLOYEE)
- [x] validator: `roleId` cuid optional (create + update)
- [x] shared: `roleId?` trên CreateEmployeeRequest / UpdateEmployeeRequest
- [x] service: input `roleId?`; `resolveRoleAssignment` (tenant + reject super_admin + enum); wire create/update
- [x] test: assign by roleId (system + custom), reject super_admin, reject cross-tenant, non-admin ignored

## Checkpoint CP1: API xanh, enum-path còn chạy ✅

## Slice 2: Expose roleId/roleName trên EmployeeDto.user
- [x] repository: thêm roleId + roleRef.name vào user-select
- [x] shared: EmployeeUserDto += roleId, roleRef.name
- [x] test: GET detail trả user.roleId + roleRef.name

## Slice 3: Form chọn role thật, gửi roleId
- [x] EmployeeForm: Select từ useRoles (ẩn super_admin), value=role.id, prefill user.roleId
- [x] EditEmployeePage: onSubmit gửi roleId
- [x] CreateEmployeePage: Select từ useRoles, gửi roleId
- [x] cập nhật CreateEmployeePage.test + EditEmployeePage.test (mock useRoles)

## Checkpoint CP2: FE build + web test xanh, verify browser ✅

## Slice 4: i18n + polish + regression
- [x] i18n vi/en: giữ form.role + placeholder (role names từ data; form.roles enum map không còn dùng)
- [x] EmployeeDetailPage: hiển thị roleRef.name (fallback user.role) thay vì enum thô
- [x] full test suite xanh + build pass (API 543, web 317, typecheck sạch)
- [x] design checklist; KHÔNG commit/ship khi chưa được lệnh

## Checkpoint CP3: full pnpm test xanh ✅
