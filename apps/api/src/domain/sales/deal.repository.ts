import type { Prisma, DealStatus } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';
import type { CustomerScope } from './customer.normalize.js';

const dealInclude = {
  customer: { select: { id: true, fullName: true } },
  currentStage: { select: { id: true, name: true, type: true } },
  owner: { select: { id: true, fullName: true } },
} satisfies Prisma.DealInclude;

/** Deals are always owned (no Lead Pool): view_all sees the tenant, else only own. */
function dealScopeWhere(scope: CustomerScope): Prisma.DealWhereInput {
  if (scope.canViewAll) return {};
  return { ownerId: scope.employeeId ?? '__none__' };
}

export interface DealListFilters {
  pipelineId?: string;
  status?: DealStatus;
  search?: string;
}

export const dealRepository = {
  async list(tenantId: string, scope: CustomerScope, filters: DealListFilters) {
    const where: Prisma.DealWhereInput = {
      AND: [
        { tenantId },
        dealScopeWhere(scope),
        filters.pipelineId ? { pipelineId: filters.pipelineId } : {},
        filters.status ? { status: filters.status } : {},
        filters.search ? { title: { contains: filters.search, mode: 'insensitive' } } : {},
      ],
    };
    return db.deal.findMany({ where, include: dealInclude, orderBy: { createdAt: 'desc' } });
  },

  async findById(tenantId: string, id: string) {
    return db.deal.findFirst({ where: { id, tenantId }, include: dealInclude });
  },

  async create(data: Prisma.DealUncheckedCreateInput) {
    return db.deal.create({ data, include: dealInclude });
  },

  async update(tenantId: string, id: string, data: Prisma.DealUncheckedUpdateInput) {
    const res = await db.deal.updateMany({ where: { id, tenantId }, data });
    if (res.count === 0) return null;
    return db.deal.findFirst({ where: { id, tenantId }, include: dealInclude });
  },

  /** Move a deal to a new stage; records DealStageHistory + STAGE_CHANGED activity (tx). */
  async move(tenantId: string, id: string, toStageId: string, actorEmployeeId: string | null, note?: string) {
    return db.$transaction(async (tx) => {
      const deal = await tx.deal.findFirst({ where: { id, tenantId }, select: { currentStageId: true, customerId: true } });
      if (!deal) return null;
      const toStage = await tx.salesStage.findFirst({ where: { id: toStageId, pipeline: { tenantId } }, select: { id: true, name: true } });
      if (!toStage) return 'BAD_STAGE' as const;
      if (deal.currentStageId === toStageId) {
        return tx.deal.findFirst({ where: { id, tenantId }, include: dealInclude });
      }
      const fromStage = await tx.salesStage.findUnique({ where: { id: deal.currentStageId }, select: { name: true } });
      await tx.deal.update({ where: { id }, data: { currentStageId: toStageId } });
      await tx.dealStageHistory.create({
        data: { dealId: id, fromStageId: deal.currentStageId, toStageId, changedById: actorEmployeeId, note },
      });
      await tx.salesActivity.create({
        data: {
          tenantId,
          customerId: deal.customerId,
          dealId: id,
          authorId: actorEmployeeId,
          type: 'STAGE_CHANGED',
          body: `${fromStage?.name ?? '?'} → ${toStage.name}`,
        },
      });
      return tx.deal.findFirst({ where: { id, tenantId }, include: dealInclude });
    });
  },

  /**
   * Close a deal WON/LOST (tx). WON pushes the customer's lifecycle to CUSTOMER.
   * LOST stores lostReason. Both write a STATUS_CHANGED activity.
   */
  async close(tenantId: string, id: string, status: 'WON' | 'LOST', lostReason: string | null, actorEmployeeId: string | null, stampNow: Date) {
    return db.$transaction(async (tx) => {
      const deal = await tx.deal.findFirst({ where: { id, tenantId }, select: { customerId: true, status: true } });
      if (!deal) return null;
      await tx.deal.update({
        where: { id },
        data: {
          status,
          wonAt: status === 'WON' ? stampNow : null,
          lostAt: status === 'LOST' ? stampNow : null,
          lostReason: status === 'LOST' ? lostReason : null,
        },
      });
      if (status === 'WON') {
        await tx.customer.update({ where: { id: deal.customerId }, data: { lifecycleStatus: 'CUSTOMER' } });
      }
      await tx.salesActivity.create({
        data: { tenantId, customerId: deal.customerId, dealId: id, authorId: actorEmployeeId, type: 'STATUS_CHANGED', body: status },
      });
      return tx.deal.findFirst({ where: { id, tenantId }, include: dealInclude });
    });
  },
};
