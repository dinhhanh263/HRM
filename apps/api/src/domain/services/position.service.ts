import type { Position, Department } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import { positionRepository } from '../repositories/position.repository.js';
import { departmentRepository } from '../repositories/department.repository.js';

type PositionWithDept = Position & {
  department: Department | null;
  _count: { employees: number };
};

function toDto(position: PositionWithDept) {
  return {
    id: position.id,
    tenantId: position.tenantId,
    departmentId: position.departmentId,
    name: position.name,
    level: position.level,
    employeeCount: position._count.employees,
    createdAt: position.createdAt.toISOString(),
    updatedAt: position.updatedAt.toISOString(),
    department: position.department
      ? {
          id: position.department.id,
          tenantId: position.department.tenantId,
          name: position.department.name,
          description: position.department.description,
          createdAt: position.department.createdAt.toISOString(),
          updatedAt: position.department.updatedAt.toISOString(),
        }
      : null,
  };
}

export const positionService = {
  async getAll(tenantId: string) {
    const positions = await positionRepository.findAll(tenantId);
    return positions.map(toDto);
  },

  async getById(id: string, tenantId: string) {
    const position = await positionRepository.findById(id, tenantId);
    if (!position) {
      throw new NotFoundError('Position not found');
    }
    return toDto(position);
  },

  async create(
    tenantId: string,
    data: { name: string; departmentId?: string; level?: number }
  ) {
    const existing = await positionRepository.findByName(data.name, tenantId);
    if (existing) {
      throw new ConflictError('Position name already exists');
    }

    if (data.departmentId) {
      const dept = await departmentRepository.findById(data.departmentId, tenantId);
      if (!dept) {
        throw new NotFoundError('Department not found');
      }
    }

    const position = await positionRepository.create({
      tenantId,
      name: data.name,
      departmentId: data.departmentId,
      level: data.level ?? 1,
    });

    return toDto(position);
  },

  async update(
    id: string,
    tenantId: string,
    data: { name?: string; departmentId?: string | null; level?: number }
  ) {
    const position = await positionRepository.findById(id, tenantId);
    if (!position) {
      throw new NotFoundError('Position not found');
    }

    if (data.name && data.name !== position.name) {
      const existing = await positionRepository.findByName(data.name, tenantId);
      if (existing) {
        throw new ConflictError('Position name already exists');
      }
    }

    if (data.departmentId) {
      const dept = await departmentRepository.findById(data.departmentId, tenantId);
      if (!dept) {
        throw new NotFoundError('Department not found');
      }
    }

    const updated = await positionRepository.update(id, data);
    return toDto(updated);
  },

  async delete(id: string, tenantId: string) {
    const position = await positionRepository.findById(id, tenantId);
    if (!position) {
      throw new NotFoundError('Position not found');
    }

    const hasEmployees = await positionRepository.hasEmployees(id);
    if (hasEmployees) {
      throw new ConflictError('Cannot delete position with employees');
    }

    await positionRepository.delete(id);
  },
};
