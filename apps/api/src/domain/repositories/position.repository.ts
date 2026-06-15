import type { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

export const positionRepository = {
  async findAll(tenantId: string) {
    return db.position.findMany({
      where: { tenantId },
      include: { department: true, _count: { select: { employees: true } } },
      orderBy: { name: 'asc' },
    });
  },

  async findById(id: string, tenantId: string) {
    return db.position.findFirst({
      where: { id, tenantId },
      include: { department: true, _count: { select: { employees: true } } },
    });
  },

  async findByName(name: string, tenantId: string) {
    return db.position.findFirst({
      where: { name, tenantId },
    });
  },

  async create(data: Prisma.PositionUncheckedCreateInput) {
    return db.position.create({
      data,
      include: { department: true, _count: { select: { employees: true } } },
    });
  },

  async update(id: string, data: Prisma.PositionUpdateInput) {
    return db.position.update({
      where: { id },
      data,
      include: { department: true, _count: { select: { employees: true } } },
    });
  },

  async delete(id: string) {
    return db.position.delete({ where: { id } });
  },

  async hasEmployees(id: string) {
    const count = await db.employee.count({ where: { positionId: id } });
    return count > 0;
  },
};
