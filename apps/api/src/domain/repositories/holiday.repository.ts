import { db } from '../../infrastructure/database/client.js';
import type { Prisma } from '@prisma/client';

export const holidayRepository = {
  async findByYear(tenantId: string, year: number) {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    return db.holiday.findMany({
      where: { tenantId, date: { gte: start, lt: end } },
      orderBy: { date: 'asc' },
    });
  },

  async findById(tenantId: string, id: string) {
    return db.holiday.findFirst({ where: { id, tenantId } });
  },

  async create(data: Prisma.HolidayCreateInput) {
    return db.holiday.create({ data });
  },

  async update(id: string, data: Prisma.HolidayUpdateInput) {
    return db.holiday.update({ where: { id }, data });
  },

  async delete(id: string) {
    return db.holiday.delete({ where: { id } });
  },
};
