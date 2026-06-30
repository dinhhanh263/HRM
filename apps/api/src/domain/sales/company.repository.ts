import type { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

const withCount = { _count: { select: { customers: true } } } satisfies Prisma.SalesCompanyInclude;

export interface CompanyListOptions {
  search?: string;
  page: number;
  limit: number;
}

export const companyRepository = {
  async list(tenantId: string, opts: CompanyListOptions) {
    const where: Prisma.SalesCompanyWhereInput = { tenantId };
    if (opts.search) {
      where.OR = [
        { name: { contains: opts.search, mode: 'insensitive' } },
        { taxCode: { contains: opts.search, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await Promise.all([
      db.salesCompany.findMany({
        where,
        include: withCount,
        orderBy: { name: 'asc' },
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
      }),
      db.salesCompany.count({ where }),
    ]);
    return { data, total };
  },

  async findById(tenantId: string, id: string) {
    return db.salesCompany.findFirst({ where: { id, tenantId }, include: withCount });
  },

  async create(data: Prisma.SalesCompanyUncheckedCreateInput) {
    return db.salesCompany.create({ data, include: withCount });
  },

  async update(tenantId: string, id: string, data: Prisma.SalesCompanyUncheckedUpdateInput) {
    const res = await db.salesCompany.updateMany({ where: { id, tenantId }, data });
    if (res.count === 0) return null;
    return db.salesCompany.findFirst({ where: { id, tenantId }, include: withCount });
  },
};
