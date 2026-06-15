import { db } from '../../infrastructure/database/client.js';
import type { Prisma } from '@prisma/client';

export const payrollSettingsRepository = {
  async findByTenant(tenantId: string) {
    return db.payrollSettings.findUnique({ where: { tenantId } });
  },

  async create(data: Prisma.PayrollSettingsCreateInput) {
    return db.payrollSettings.create({ data });
  },

  async update(tenantId: string, data: Prisma.PayrollSettingsUpdateInput) {
    return db.payrollSettings.update({ where: { tenantId }, data });
  },
};
