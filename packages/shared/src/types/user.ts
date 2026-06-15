export const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  HR_MANAGER: 'HR_MANAGER',
  PAYROLL_APPROVER: 'PAYROLL_APPROVER',
  MANAGER: 'MANAGER',
  EMPLOYEE: 'EMPLOYEE',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  PENDING: 'PENDING',
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

// SPEC-033: tóm tắt hồ sơ nhân viên gắn với user — FE dùng quyết định hiển thị
// các tính năng self-service (vd. nav "Tự đánh giá" chỉ khi đang PROBATION).
export interface UserEmployeeSummary {
  id: string;
  contractType: string;
}

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  roleId: string | null;
  permissions: string[];
  status: UserStatus;
  tenantId: string;
  employee: UserEmployeeSummary | null;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}
