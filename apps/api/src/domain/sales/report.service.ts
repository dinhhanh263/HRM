import { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';
import type { CustomerScope } from './customer.normalize.js';

/** Owner filter for deals/customers (no Lead Pool concept on the dashboard). */
function ownerWhere(scope: CustomerScope): { ownerId?: string } {
  if (scope.canViewAll) return {};
  return { ownerId: scope.employeeId ?? '__none__' };
}

function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export const salesReportService = {
  async overview(tenantId: string, scope: CustomerScope) {
    const dealOwner = ownerWhere(scope);
    const custOwner = ownerWhere(scope);
    const monthStart = startOfMonth();

    const [lifecycle, sources, openDeals, wonThisMonth, lostThisMonth, pipelines] = await Promise.all([
      db.customer.groupBy({ by: ['lifecycleStatus'], where: { tenantId, ...custOwner }, _count: true }),
      db.customer.groupBy({ by: ['source'], where: { tenantId, ...custOwner }, _count: true }),
      db.deal.findMany({ where: { tenantId, status: 'OPEN', ...dealOwner }, select: { amount: true, currentStageId: true } }),
      db.deal.aggregate({ where: { tenantId, status: 'WON', wonAt: { gte: monthStart }, ...dealOwner }, _count: true, _sum: { amount: true } }),
      db.deal.aggregate({ where: { tenantId, status: 'LOST', lostAt: { gte: monthStart }, ...dealOwner }, _count: true, _sum: { amount: true } }),
      db.salesPipeline.findMany({ where: { tenantId }, include: { stages: { orderBy: { order: 'asc' } } } }),
    ]);

    // Pipeline value per stage (OPEN deals).
    const stageMap = new Map<string, { name: string; type: string; probability: number }>();
    pipelines.forEach((p) => p.stages.forEach((s) => stageMap.set(s.id, { name: s.name, type: s.type, probability: s.probability })));
    const byStage = new Map<string, { name: string; type: string; probability: number; count: number; amount: Prisma.Decimal }>();
    for (const d of openDeals) {
      const meta = stageMap.get(d.currentStageId);
      if (!meta) continue;
      const cur = byStage.get(d.currentStageId) ?? { ...meta, count: 0, amount: new Prisma.Decimal(0) };
      cur.count += 1;
      cur.amount = cur.amount.plus(d.amount);
      byStage.set(d.currentStageId, cur);
    }

    const openPipelineTotal = openDeals.reduce((s, d) => s.plus(d.amount), new Prisma.Decimal(0));

    return {
      lifecycleCounts: Object.fromEntries(lifecycle.map((l) => [l.lifecycleStatus, l._count])),
      sourceCounts: Object.fromEntries(sources.map((s) => [s.source, s._count])),
      pipeline: [...byStage.values()].map((s) => ({ name: s.name, type: s.type, count: s.count, amount: s.amount.toString() })),
      openPipelineTotal: openPipelineTotal.toString(),
      wonThisMonth: { count: wonThisMonth._count, amount: (wonThisMonth._sum.amount ?? new Prisma.Decimal(0)).toString() },
      lostThisMonth: { count: lostThisMonth._count, amount: (lostThisMonth._sum.amount ?? new Prisma.Decimal(0)).toString() },
    };
  },

  /** Weighted forecast = Σ amount × stage.probability/100 over OPEN deals. */
  async forecast(tenantId: string, scope: CustomerScope) {
    const openDeals = await db.deal.findMany({
      where: { tenantId, status: 'OPEN', ...ownerWhere(scope) },
      select: { amount: true, currentStage: { select: { name: true, probability: true } } },
    });
    let weightedTotal = new Prisma.Decimal(0);
    const byStage = new Map<string, Prisma.Decimal>();
    for (const d of openDeals) {
      const prob = new Prisma.Decimal(d.currentStage.probability).div(100);
      const w = d.amount.mul(prob);
      weightedTotal = weightedTotal.plus(w);
      byStage.set(d.currentStage.name, (byStage.get(d.currentStage.name) ?? new Prisma.Decimal(0)).plus(w));
    }
    return {
      weightedTotal: weightedTotal.toDecimalPlaces(0).toString(),
      byStage: [...byStage.entries()].map(([name, amount]) => ({ name, weighted: amount.toDecimalPlaces(0).toString() })),
    };
  },

  /** Manager-only: lead/customer distribution per owner. */
  async byOwner(tenantId: string) {
    const grouped = await db.customer.groupBy({ by: ['ownerId'], where: { tenantId }, _count: true });
    const ownerIds = grouped.map((g) => g.ownerId).filter((id): id is string => Boolean(id));
    const employees = await db.employee.findMany({ where: { id: { in: ownerIds } }, select: { id: true, fullName: true } });
    const nameById = new Map(employees.map((e) => [e.id, e.fullName]));
    return grouped.map((g) => ({ ownerId: g.ownerId, ownerName: g.ownerId ? nameById.get(g.ownerId) ?? '?' : 'Lead Pool', count: g._count }));
  },
};
