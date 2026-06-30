import { db } from '../../infrastructure/database/client.js';
import { NotFoundError } from '../../shared/errors/index.js';
import type { SalesActivityType } from '@prisma/client';

const activityInclude = {
  author: { select: { id: true, fullName: true } },
  deal: { select: { id: true, title: true } },
};

interface ActivityRow {
  id: string;
  type: SalesActivityType;
  body: string | null;
  author: { id: string; fullName: string } | null;
  deal: { id: string; title: string } | null;
  occurredAt: Date;
}

function toDto(a: ActivityRow) {
  return {
    id: a.id,
    type: a.type,
    body: a.body,
    author: a.author ? { id: a.author.id, fullName: a.author.fullName } : null,
    deal: a.deal ? { id: a.deal.id, title: a.deal.title } : null,
    occurredAt: a.occurredAt.toISOString(),
  };
}

export const salesActivityService = {
  /** Full timeline for a customer (system events + manual notes), newest first. */
  async listForCustomer(tenantId: string, customerId: string) {
    const customer = await db.customer.findFirst({ where: { id: customerId, tenantId }, select: { id: true } });
    if (!customer) throw new NotFoundError('Không tìm thấy khách hàng');
    const rows = await db.salesActivity.findMany({
      where: { tenantId, customerId },
      include: activityInclude,
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => toDto(r as ActivityRow));
  },

  /** Add a manual note to a customer's timeline. */
  async addNote(tenantId: string, customerId: string, authorEmployeeId: string | null, body: string) {
    const customer = await db.customer.findFirst({ where: { id: customerId, tenantId }, select: { id: true } });
    if (!customer) throw new NotFoundError('Không tìm thấy khách hàng');
    const created = await db.salesActivity.create({
      data: { tenantId, customerId, authorId: authorEmployeeId, type: 'NOTE', body: body.trim() },
      include: activityInclude,
    });
    return toDto(created as ActivityRow);
  },
};
