import type { Department } from '@prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import { departmentRepository } from '../repositories/department.repository.js';
import { employeeRepository } from '../repositories/employee.repository.js';

type ManagerRef = { id: string; fullName: string; employeeCode: string } | null;
type DepartmentWithCount = Department & {
  _count: { employees: number };
  manager?: ManagerRef;
};

function toDto(department: DepartmentWithCount) {
  return {
    id: department.id,
    tenantId: department.tenantId,
    name: department.name,
    description: department.description,
    managerId: department.managerId,
    manager: department.manager ?? null,
    employeeCount: department._count.employees,
    createdAt: department.createdAt.toISOString(),
    updatedAt: department.updatedAt.toISOString(),
  };
}

/** Ensure a department-head employee exists within the same tenant. */
async function validateDepartmentHead(tenantId: string, managerId: string): Promise<void> {
  const employee = await employeeRepository.findById(managerId, tenantId);
  if (!employee) {
    throw new BadRequestError('Department head not found', 'DEPARTMENT_HEAD_NOT_FOUND');
  }
}

export const departmentService = {
  async getAll(tenantId: string) {
    const departments = await departmentRepository.findAll(tenantId);
    return departments.map(toDto);
  },

  async getById(id: string, tenantId: string) {
    const department = await departmentRepository.findById(id, tenantId);
    if (!department) {
      throw new NotFoundError('Department not found');
    }
    return toDto(department);
  },

  async create(
    tenantId: string,
    data: { name: string; description?: string; managerId?: string | null }
  ) {
    const existing = await departmentRepository.findByName(data.name, tenantId);
    if (existing) {
      throw new ConflictError('Department name already exists');
    }

    if (data.managerId) {
      await validateDepartmentHead(tenantId, data.managerId);
    }

    const department = await departmentRepository.create({
      tenantId,
      name: data.name,
      description: data.description,
      managerId: data.managerId ?? null,
    });

    return toDto(department);
  },

  async update(
    id: string,
    tenantId: string,
    data: { name?: string; description?: string; managerId?: string | null }
  ) {
    const department = await departmentRepository.findById(id, tenantId);
    if (!department) {
      throw new NotFoundError('Department not found');
    }

    if (data.name && data.name !== department.name) {
      const existing = await departmentRepository.findByName(data.name, tenantId);
      if (existing) {
        throw new ConflictError('Department name already exists');
      }
    }

    if (data.managerId) {
      await validateDepartmentHead(tenantId, data.managerId);
    }

    const updated = await departmentRepository.update(id, {
      name: data.name,
      description: data.description,
      managerId: data.managerId === undefined ? undefined : data.managerId,
    });
    return toDto(updated);
  },

  async delete(id: string, tenantId: string) {
    const department = await departmentRepository.findById(id, tenantId);
    if (!department) {
      throw new NotFoundError('Department not found');
    }

    const hasEmployees = await departmentRepository.hasEmployees(id);
    if (hasEmployees) {
      throw new ConflictError('Cannot delete department with employees');
    }

    await departmentRepository.delete(id);
  },
};
