import { db } from '../../infrastructure/database/client.js';
import type { Prisma } from '@prisma/client';

export interface LeaveTypeFilters {
  activeOnly?: boolean;
}

export const leaveTypeRepository = {
  async findAll(tenantId: string, filters: LeaveTypeFilters = {}) {
    const where: Prisma.LeaveTypeWhereInput = { tenantId };
    if (filters.activeOnly) {
      where.active = true;
    }

    return db.leaveType.findMany({
      where,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  },

  async findById(id: string, tenantId: string) {
    return db.leaveType.findFirst({ where: { id, tenantId } });
  },

  async findByCode(code: string, tenantId: string, excludeId?: string) {
    return db.leaveType.findFirst({
      where: {
        tenantId,
        code,
        ...(excludeId && { id: { not: excludeId } }),
      },
    });
  },

  async create(data: Prisma.LeaveTypeCreateInput) {
    return db.leaveType.create({ data });
  },

  async update(id: string, tenantId: string, data: Prisma.LeaveTypeUpdateInput) {
    return db.leaveType.update({ where: { id, tenantId }, data });
  },

  async delete(id: string, tenantId: string) {
    return db.leaveType.delete({ where: { id, tenantId } });
  },

  async countRequests(leaveTypeId: string) {
    return db.leaveRequest.count({ where: { leaveTypeId } });
  },
};
