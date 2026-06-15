# TODO-013: Flexible Payroll Approvers (nhiều người duyệt)

> Mục tiêu: cho phép gán vai trò "Phê duyệt lương" cho **nhiều người** qua UI, để khi
> Kế toán trưởng đi vắng vẫn có người khác duyệt. Tận dụng thiết kế RBAC role-based
> sẵn có (bất kỳ ai có `payroll:approve` đều duyệt được + đều nhận email).
>
> Quyết định đã chốt với user: (1) vá `roleId` **chung cho mọi vai trò** (không chỉ
> payroll); (2) **cho đổi vai trò khi edit** nhân viên đã tồn tại.

## Bối cảnh / lỗ hổng phát hiện
- `employee.service.create` chỉ set `user.role` (enum cũ), **không set `user.roleId`** —
  mà RBAC cấp quyền theo `roleId` (`auth.service.ts:resolvePermissions`). Chỉ seed mới
  backfill `roleId`. ⇒ user tạo qua UI có `roleId=null` → **không có quyền gì**.
- `employee.service.update` **không** cho đổi `role`.
- Form nhân viên chỉ cho chọn `EMPLOYEE / MANAGER / HR_MANAGER` — thiếu `PAYROLL_APPROVER`.

## Slice 1: Nền tảng — resolve `roleId` từ role enum
- [ ] 1.1 (RED) integration: tạo employee role=HR_MANAGER → `user.roleId` trỏ role `hr_manager`; login → permissions có `employees:create`. Update role → roleId đổi.
- [ ] 1.2 catalog.ts: helper `roleKeyForUserRole(role): string` (map từ SYSTEM_ROLES).
- [ ] 1.3 employee.service.create: resolve + set `roleId`. update: nhận `role`, sync `role`+`roleId`.
- [ ] 1.4 (GREEN) tests xanh; không phá test hiện có.

## Slice 2: Cho chọn vai trò "Phê duyệt lương"
- [ ] 2.1 (RED) integration: tạo/đổi employee → PAYROLL_APPROVER → roleId=`payroll_approver`; có trong `findApproverRecipients`; approve được.
- [ ] 2.2 API: `employee.validator.ts` roleEnum += PAYROLL_APPROVER; service input union += PAYROLL_APPROVER.
- [ ] 2.3 FE: CreateEmployeePage + EmployeeForm zod + Select option; i18n `form.roles.PAYROLL_APPROVER` (vi/en).
- [ ] 2.4 (GREEN) tests xanh.

## Slice 3: Đổi vai trò khi edit + verify
- [ ] 3.1 FE edit form expose role select (đổi role nhân viên hiện hữu).
- [ ] 3.2 Regression api+web xanh; typecheck sạch.
- [ ] 3.3 Manual: gán 2 người làm approver, KTT "vắng" → người kia vẫn duyệt; screenshot light+dark; khôi phục VI+Light.

## ✅ Checkpoint → /review
