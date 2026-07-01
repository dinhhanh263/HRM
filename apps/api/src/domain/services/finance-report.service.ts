import { db } from '../../infrastructure/database/client.js';
import type {
  BudgetVsActualResponse,
  BudgetVsActualRow,
  ForecastResponse,
  ForecastDay,
  FinanceReportResponse,
  FinanceReportGroup,
} from '@hrm/shared';

function monthWindow(month?: string): { start: Date; end: Date; period: string } {
  const now = new Date();
  let year = now.getUTCFullYear();
  let m = now.getUTCMonth();
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, mm] = month.split('-').map(Number);
    year = y;
    m = mm - 1;
  }
  return {
    start: new Date(Date.UTC(year, m, 1)),
    end: new Date(Date.UTC(year, m + 1, 1)),
    period: `${year}-${String(m + 1).padStart(2, '0')}`,
  };
}

// Merge planned + actual maps into sorted rows (by planned desc, then actual desc).
function buildRows(
  planned: Map<string, number>,
  actual: Map<string, number>,
  labels: Map<string, string>,
  noneLabel: string,
): BudgetVsActualRow[] {
  const keys = new Set<string>([...planned.keys(), ...actual.keys()]);
  const rows: BudgetVsActualRow[] = [];
  for (const key of keys) {
    const p = planned.get(key) ?? 0;
    const a = actual.get(key) ?? 0;
    rows.push({
      key,
      label: key === 'none' ? noneLabel : labels.get(key) ?? noneLabel,
      planned: String(p),
      actual: String(a),
      variance: String(p - a),
      usedPct: p > 0 ? Math.round((a / p) * 100) : 0,
      over: a > p,
    });
  }
  return rows.sort((x, y) => Number(y.planned) - Number(x.planned) || Number(y.actual) - Number(x.actual));
}

export const financeReportService = {
  // Compare APPROVED spending plans vs ACTUAL OUT transactions for a period,
  // broken down by department and by category.
  async budgetVsActual(
    tenantId: string,
    opts: { month?: string; issuingEntityId?: string },
  ): Promise<BudgetVsActualResponse> {
    const { start, end, period } = monthWindow(opts.month);
    const entity = opts.issuingEntityId ? { issuingEntityId: opts.issuingEntityId } : {};

    // Planned = APPROVED plan items in the period.
    const plans = await db.spendingPlan.findMany({
      where: { tenantId, period, status: 'APPROVED', ...entity },
      include: { items: { select: { amount: true, categoryId: true } } },
    });
    const plannedByDept = new Map<string, number>();
    const plannedByCat = new Map<string, number>();
    for (const plan of plans) {
      const dk = plan.departmentId ?? 'none';
      for (const it of plan.items) {
        const amt = Number(it.amount);
        plannedByDept.set(dk, (plannedByDept.get(dk) ?? 0) + amt);
        const ck = it.categoryId ?? 'none';
        plannedByCat.set(ck, (plannedByCat.get(ck) ?? 0) + amt);
      }
    }

    // Actual = ACTUAL OUT transactions in the period.
    const txs = await db.cashTransaction.findMany({
      where: { tenantId, status: 'ACTUAL', direction: 'OUT', occurredAt: { gte: start, lt: end }, ...entity },
      select: { amount: true, departmentId: true, categoryId: true },
    });
    const actualByDept = new Map<string, number>();
    const actualByCat = new Map<string, number>();
    for (const tx of txs) {
      const amt = Number(tx.amount);
      const dk = tx.departmentId ?? 'none';
      actualByDept.set(dk, (actualByDept.get(dk) ?? 0) + amt);
      const ck = tx.categoryId ?? 'none';
      actualByCat.set(ck, (actualByCat.get(ck) ?? 0) + amt);
    }

    // Label maps.
    const deptIds = [...new Set([...plannedByDept.keys(), ...actualByDept.keys()])].filter((k) => k !== 'none');
    const catIds = [...new Set([...plannedByCat.keys(), ...actualByCat.keys()])].filter((k) => k !== 'none');
    const [depts, cats] = await Promise.all([
      deptIds.length ? db.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } }) : [],
      catIds.length ? db.financeCategory.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } }) : [],
    ]);
    const deptLabels = new Map(depts.map((d) => [d.id, d.name]));
    const catLabels = new Map(cats.map((c) => [c.id, c.name]));

    const byDepartment = buildRows(plannedByDept, actualByDept, deptLabels, 'Không gắn bộ phận');
    const byCategory = buildRows(plannedByCat, actualByCat, catLabels, 'Chưa phân loại');

    const totalPlanned = [...plannedByDept.values()].reduce((s, v) => s + v, 0);
    const totalActual = [...actualByDept.values()].reduce((s, v) => s + v, 0);

    return {
      period,
      byDepartment,
      byCategory,
      totalPlanned: String(totalPlanned),
      totalActual: String(totalActual),
    };
  },

  // Project the running cash balance day-by-day across the period:
  //   opening (current balance) + PLANNED IN − (APPROVED plan items by expectedDate
  //   + PLANNED OUT). Reports the first day it dips below zero + the end shortfall.
  async forecast(
    tenantId: string,
    opts: { month?: string; issuingEntityId?: string },
  ): Promise<ForecastResponse> {
    const { start, end, period } = monthWindow(opts.month);
    const entity = opts.issuingEntityId ? { issuingEntityId: opts.issuingEntityId } : {};

    const balanceAgg = await db.fundAccount.aggregate({
      where: { tenantId, active: true, ...entity },
      _sum: { currentBalance: true },
    });
    const opening = Number(balanceAgg._sum.currentBalance ?? 0);

    // Per-day deltas: +PLANNED IN, −PLANNED OUT, −APPROVED plan items (by expectedDate).
    const deltas = new Map<string, number>(); // "YYYY-MM-DD" → net change
    const bump = (date: Date, amount: number) => {
      const key = date.toISOString().slice(0, 10);
      deltas.set(key, (deltas.get(key) ?? 0) + amount);
    };

    const planned = await db.cashTransaction.findMany({
      where: { tenantId, status: 'PLANNED', occurredAt: { gte: start, lt: end }, ...entity },
      select: { direction: true, amount: true, occurredAt: true },
    });
    let expectedIn = 0;
    let expectedOutPlanned = 0;
    for (const p of planned) {
      const amt = Number(p.amount);
      if (p.direction === 'IN') {
        expectedIn += amt;
        bump(p.occurredAt, amt);
      } else {
        expectedOutPlanned += amt;
        bump(p.occurredAt, -amt);
      }
    }

    // APPROVED plan items with an expectedDate in the period count as expected outflow.
    const plans = await db.spendingPlan.findMany({
      where: { tenantId, period, status: 'APPROVED', ...entity },
      include: { items: { select: { amount: true, expectedDate: true } } },
    });
    let expectedOutPlan = 0;
    for (const plan of plans) {
      for (const it of plan.items) {
        if (!it.expectedDate) continue;
        if (it.expectedDate < start || it.expectedDate >= end) continue;
        const amt = Number(it.amount);
        expectedOutPlan += amt;
        bump(it.expectedDate, -amt);
      }
    }

    // Walk each day of the period, accumulating the running balance.
    const series: ForecastDay[] = [];
    let running = opening;
    let cashOutDate: string | null = null;
    for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      running += deltas.get(key) ?? 0;
      if (cashOutDate === null && running < 0) cashOutDate = key;
      series.push({ date: key, balance: String(running) });
    }

    const projectedEndBalance = running;
    const shortfall = projectedEndBalance < 0 ? -projectedEndBalance : 0;

    return {
      period,
      openingBalance: String(opening),
      expectedIn: String(expectedIn),
      expectedOut: String(expectedOutPlanned + expectedOutPlan),
      projectedEndBalance: String(projectedEndBalance),
      cashOutDate,
      shortfall: String(shortfall),
      series,
    };
  },

  // Company-wide ACTUAL thu/chi for a year, broken down by month / entity / category
  // / department. Optional entity filter. Powers the multi-entity report + Excel.
  async report(tenantId: string, opts: { year?: number; issuingEntityId?: string }): Promise<FinanceReportResponse> {
    const year = opts.year && opts.year >= 2000 && opts.year <= 2100 ? opts.year : new Date().getUTCFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const entity = opts.issuingEntityId ? { issuingEntityId: opts.issuingEntityId } : {};

    const txs = await db.cashTransaction.findMany({
      where: { tenantId, status: 'ACTUAL', occurredAt: { gte: start, lt: end }, ...entity },
      select: { amount: true, direction: true, occurredAt: true, issuingEntityId: true, categoryId: true, departmentId: true },
    });

    const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, in: 0, out: 0 }));
    const byEntity = new Map<string, { in: number; out: number }>();
    const byCategory = new Map<string, { in: number; out: number }>();
    const byDepartment = new Map<string, { in: number; out: number }>();
    const bump = (m: Map<string, { in: number; out: number }>, key: string, dir: 'IN' | 'OUT', amt: number) => {
      const b = m.get(key) ?? { in: 0, out: 0 };
      if (dir === 'IN') b.in += amt; else b.out += amt;
      m.set(key, b);
    };
    let totalIn = 0;
    let totalOut = 0;
    for (const tx of txs) {
      const amt = Number(tx.amount);
      const dir = tx.direction;
      if (dir === 'IN') totalIn += amt; else totalOut += amt;
      const mi = tx.occurredAt.getUTCMonth();
      if (dir === 'IN') months[mi].in += amt; else months[mi].out += amt;
      bump(byEntity, tx.issuingEntityId, dir, amt);
      bump(byCategory, tx.categoryId ?? 'none', dir, amt);
      bump(byDepartment, tx.departmentId ?? 'none', dir, amt);
    }

    // Resolve labels.
    const [entities, cats, depts] = await Promise.all([
      db.issuingEntity.findMany({ where: { id: { in: [...byEntity.keys()] } }, select: { id: true, name: true } }),
      db.financeCategory.findMany({ where: { id: { in: [...byCategory.keys()].filter((k) => k !== 'none') } }, select: { id: true, name: true } }),
      db.department.findMany({ where: { id: { in: [...byDepartment.keys()].filter((k) => k !== 'none') } }, select: { id: true, name: true } }),
    ]);
    const label = (list: { id: string; name: string }[], key: string, fallback: string) =>
      key === 'none' ? fallback : list.find((x) => x.id === key)?.name ?? fallback;
    const toGroups = (m: Map<string, { in: number; out: number }>, list: { id: string; name: string }[], fallback: string): FinanceReportGroup[] =>
      [...m.entries()]
        .map(([key, v]) => ({ key, label: label(list, key, fallback), in: String(v.in), out: String(v.out) }))
        .sort((a, b) => Number(b.out) + Number(b.in) - (Number(a.out) + Number(a.in)));

    return {
      year,
      months: months.map((m) => ({ month: m.month, in: String(m.in), out: String(m.out), net: String(m.in - m.out) })),
      byEntity: toGroups(byEntity, entities, '—'),
      byCategory: toGroups(byCategory, cats, 'Chưa phân loại'),
      byDepartment: toGroups(byDepartment, depts, 'Không gắn bộ phận'),
      totalIn: String(totalIn),
      totalOut: String(totalOut),
      net: String(totalIn - totalOut),
    };
  },
};
