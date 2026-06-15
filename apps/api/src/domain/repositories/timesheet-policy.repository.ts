import { db } from '../../infrastructure/database/client.js';
import type { Prisma } from '@prisma/client';

export const timesheetPolicyRepository = {
  async findByTenant(tenantId: string) {
    return db.timesheetPolicy.findUnique({ where: { tenantId } });
  },

  async create(data: Prisma.TimesheetPolicyCreateInput) {
    return db.timesheetPolicy.create({ data });
  },

  async update(tenantId: string, data: Prisma.TimesheetPolicyUpdateInput) {
    return db.timesheetPolicy.update({ where: { tenantId }, data });
  },
};
