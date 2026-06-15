import type { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

export const departmentRepository = {
  async findAll(tenantId: string) {
    return db.department.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { employees: true } },
        manager: { select: { id: true, fullName: true, employeeCode: true } },
      },
    });
  },

  async findById(id: string, tenantId: string) {
    return db.department.findFirst({
      where: { id, tenantId },
      include: {
        _count: { select: { employees: true } },
        manager: { select: { id: true, fullName: true, employeeCode: true } },
      },
    });
  },

  async findByName(name: string, tenantId: string) {
    return db.department.findFirst({
      where: { name, tenantId },
    });
  },

  async create(data: Prisma.DepartmentUncheckedCreateInput) {
    return db.department.create({
      data,
      include: {
        _count: { select: { employees: true } },
        manager: { select: { id: true, fullName: true, employeeCode: true } },
      },
    });
  },

  async update(id: string, data: Prisma.DepartmentUncheckedUpdateInput) {
    return db.department.update({
      where: { id },
      data,
      include: {
        _count: { select: { employees: true } },
        manager: { select: { id: true, fullName: true, employeeCode: true } },
      },
    });
  },

  async delete(id: string) {
    return db.department.delete({ where: { id } });
  },

  async hasEmployees(id: string) {
    const count = await db.employee.count({ where: { departmentId: id } });
    return count > 0;
  },
};
