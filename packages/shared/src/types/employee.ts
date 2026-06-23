import type { DepartmentDto } from './department.js';
import type { PositionDto } from './position.js';

export const Gender = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  OTHER: 'OTHER',
} as const;

export type Gender = (typeof Gender)[keyof typeof Gender];

export const ContractType = {
  FULL_TIME: 'FULL_TIME',
  PART_TIME: 'PART_TIME',
  CONTRACT: 'CONTRACT',
  INTERN: 'INTERN',
  PROBATION: 'PROBATION',
} as const;

export type ContractType = (typeof ContractType)[keyof typeof ContractType];

export const EmployeeStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  TERMINATED: 'TERMINATED',
} as const;

export type EmployeeStatus = (typeof EmployeeStatus)[keyof typeof EmployeeStatus];

export const MaritalStatus = {
  SINGLE: 'SINGLE',
  MARRIED: 'MARRIED',
  DIVORCED: 'DIVORCED',
  WIDOWED: 'WIDOWED',
  OTHER: 'OTHER',
} as const;

export type MaritalStatus = (typeof MaritalStatus)[keyof typeof MaritalStatus];

/**
 * Extended employee profile fields (SPEC-040). All optional; present on the DTO,
 * create and update payloads alike.
 */
export interface ExtendedEmployeeFields {
  placeOfBirth?: string | null;
  idIssueDate?: string | null;
  idIssuePlace?: string | null;
  personalEmail?: string | null;
  education?: string | null;
  maritalStatus?: MaritalStatus | null;
  permanentAddress?: string | null;
  currentAddress?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactPhone?: string | null;
  bankAccountNumber?: string | null;
  bankName?: string | null;
  bankBranch?: string | null;
  taxCode?: string | null;
  socialInsuranceNumber?: string | null;
  healthcareFacility?: string | null;
  motorbikeRegistration?: string | null;
}

/** Roles assignable to an employee via the UI. SUPER_ADMIN is intentionally
 * excluded — it is not granted through the employee form. */
export type AssignableEmployeeRole = 'EMPLOYEE' | 'MANAGER' | 'HR_MANAGER' | 'PAYROLL_APPROVER';

export interface EmployeeUserDto {
  id: string;
  email: string;
  role: string;
  roleId: string | null;
  /** The assigned Role row (system or custom) — `name` is shown on the detail page. */
  roleRef?: { name: string } | null;
  status: string;
}

/** Slim manager reference used for display in employee/department views. */
export interface EmployeeManagerDto {
  id: string;
  fullName: string;
  employeeCode: string;
}

export interface EmployeeDto {
  id: string;
  tenantId: string;
  userId: string;
  employeeCode: string;
  departmentId: string | null;
  positionId: string | null;
  managerId: string | null;
  fullName: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  idNumber: string | null;
  phone: string | null;
  avatar: string | null;
  joinDate: string;
  /** Probation end date (HR-entered); null when not applicable. */
  probationEndDate: string | null;
  contractType: ContractType;
  /** Number of registered tax dependents — drives the PIT dependent deduction in payroll. */
  dependentsCount: number;
  // Extended profile fields (SPEC-040) — always present on the DTO, null when unset.
  placeOfBirth: string | null;
  idIssueDate: string | null;
  idIssuePlace: string | null;
  personalEmail: string | null;
  education: string | null;
  maritalStatus: MaritalStatus | null;
  permanentAddress: string | null;
  currentAddress: string | null;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  bankAccountNumber: string | null;
  bankName: string | null;
  bankBranch: string | null;
  taxCode: string | null;
  socialInsuranceNumber: string | null;
  healthcareFacility: string | null;
  motorbikeRegistration: string | null;
  status: EmployeeStatus;
  terminatedAt: string | null;
  terminationReason: string | null;
  createdAt: string;
  updatedAt: string;
  department?: DepartmentDto | null;
  position?: PositionDto | null;
  manager?: EmployeeManagerDto | null;
  user?: EmployeeUserDto | null;
}

export interface CreateEmployeeRequest extends ExtendedEmployeeFields {
  email: string;
  password: string;
  // Manually assigned by HR/admin at creation; unique within the tenant.
  employeeCode: string;
  fullName: string;
  departmentId?: string;
  positionId?: string;
  managerId?: string;
  dateOfBirth?: string;
  gender?: Gender;
  idNumber?: string;
  phone?: string;
  joinDate?: string;
  probationEndDate?: string | null;
  contractType?: ContractType;
  dependentsCount?: number;
  role?: AssignableEmployeeRole;
  roleId?: string;
  avatarUrl?: string;
}

export interface UpdateEmployeeRequest extends ExtendedEmployeeFields {
  fullName?: string;
  departmentId?: string | null;
  positionId?: string | null;
  managerId?: string | null;
  dateOfBirth?: string | null;
  gender?: Gender | null;
  idNumber?: string | null;
  phone?: string | null;
  probationEndDate?: string | null;
  contractType?: ContractType;
  dependentsCount?: number;
  role?: AssignableEmployeeRole;
  roleId?: string;
  avatarUrl?: string | null;
}

export interface TerminateEmployeeRequest {
  reason: string;
}

export interface EmployeeListQuery {
  page?: number;
  limit?: number;
  search?: string;
  departmentId?: string;
  positionId?: string;
  status?: EmployeeStatus;
  contractType?: ContractType;
  minLevel?: number;
  sort?: 'fullName' | 'joinDate' | 'employeeCode';
  order?: 'asc' | 'desc';
}
