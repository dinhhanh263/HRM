import type { DepartmentDto } from './department.js';

export const PositionLevel = {
  JUNIOR: 1,
  MID: 2,
  SENIOR: 3,
  LEAD: 4,
  MANAGER: 5,
} as const;

export type PositionLevel = (typeof PositionLevel)[keyof typeof PositionLevel];

export interface PositionDto {
  id: string;
  tenantId: string;
  departmentId: string | null;
  name: string;
  level: number;
  employeeCount: number;
  createdAt: string;
  updatedAt: string;
  department?: DepartmentDto | null;
}

export interface CreatePositionRequest {
  name: string;
  departmentId?: string;
  level?: number;
}

export interface UpdatePositionRequest {
  name?: string;
  departmentId?: string | null;
  level?: number;
}
