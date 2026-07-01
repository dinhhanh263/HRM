import { db } from '../../infrastructure/database/client.js';
import type { FinanceDashboardQuery, FinanceDashboardResponse, FinanceDashboardDay } from '@hrm/shared';

// Resolve a "YYYY-MM" (or default: current month) into a [start, end) UTC window.
function monthWindow(month?: string): { start: Date; end: Date; period: string } {
  const now = new Date();
  let year = now.getUTCFullYear();
  let m = now.getUTCMonth(); // 0-based
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, mm] = month.split('-').map(Number);
    year = y;
    m = mm - 1;
  }
  const start = new Date(Date.UTC(year, m, 1));
  const end = new Date(Date.UTC(year, m + 1, 1));
  const period = `${year}-${String(m + 1).padStart(2, '0')}`;
  return { start, end, period };
}

export const financeDashboardService = {
  async get(tenantId: string, query: FinanceDashboardQuery): Promise<FinanceDashboardResponse> {
    const { start, end, period } = monthWindow(query.month);
    const entityFilter = query.issuingEntityId ? { issuingEntityId: query.issuingEntityId } : {};

    // Current balance across matching accounts (as of now, not period-scoped).
    const balanceAgg = await db.fundAccount.aggregate({
      where: { tenantId, active: true, ...entityFilter },
      _sum: { currentBalance: true },
    });

    const periodWhere = {
      tenantId,
      status: 'ACTUAL' as const,
      occurredAt: { gte: start, lt: end },
      ...entityFilter,
    };

    // Totals by direction within the period.
    const totalsGrouped = await db.cashTransaction.groupBy({
      by: ['direction'],
      where: periodWhere,
      _sum: { amount: true },
    });
    let totalIn = 0;
    let totalOut = 0;
    for (const g of totalsGrouped) {
      const s = Number(g._sum.amount ?? 0);
      if (g.direction === 'IN') totalIn = s;
      else totalOut = s;
    }

    // Daily series — fetch the period's rows and bucket by day in JS.
    const rows = await db.cashTransaction.findMany({
      where: periodWhere,
      select: { occurredAt: true, direction: true, amount: true },
    });
    const byDay = new Map<string, { in: number; out: number }>();
    for (const r of rows) {
      const day = r.occurredAt.toISOString().slice(0, 10);
      const bucket = byDay.get(day) ?? { in: 0, out: 0 };
      if (r.direction === 'IN') bucket.in += Number(r.amount);
      else bucket.out += Number(r.amount);
      byDay.set(day, bucket);
    }
    const series: FinanceDashboardDay[] = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, in: String(v.in), out: String(v.out) }));

    // Top expense categories within the period.
    const catGrouped = await db.cashTransaction.groupBy({
      by: ['categoryId'],
      where: { ...periodWhere, direction: 'OUT' },
      _sum: { amount: true },
    });
    const catIds = catGrouped.map((g) => g.categoryId).filter((id): id is string => !!id);
    const cats = catIds.length
      ? await db.financeCategory.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } })
      : [];
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    const byCategory = catGrouped
      .map((g) => ({
        categoryId: g.categoryId,
        name: g.categoryId ? catName.get(g.categoryId) ?? '—' : 'Chưa phân loại',
        total: String(Number(g._sum.amount ?? 0)),
      }))
      .sort((a, b) => Number(b.total) - Number(a.total))
      .slice(0, 8);

    return {
      period,
      totalBalance: String(Number(balanceAgg._sum.currentBalance ?? 0)),
      totalIn: String(totalIn),
      totalOut: String(totalOut),
      net: String(totalIn - totalOut),
      series,
      byCategory,
    };
  },
};
