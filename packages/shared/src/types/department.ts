import type { EmployeeManagerDto } from './employee.js';

export interface DepartmentDto {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  managerId: string | null;
  manager?: EmployeeManagerDto | null;
  employeeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDepartmentRequest {
  name: string;
  description?: string;
  managerId?: string | null;
}

export interface UpdateDepartmentRequest {
  name?: string;
  description?: string;
  managerId?: string | null;
}
