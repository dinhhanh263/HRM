import type { Prisma, PrismaClient } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';
import type { CashTransactionListInput } from '../../app/validators/cash-transaction.validator.js';

type TxClient = Prisma.TransactionClient | PrismaClient;

const withRefs = {
  account: { select: { name: true } },
  issuingEntity: { select: { name: true } },
  category: { select: { name: true } },
  department: { select: { name: true } },
} as const;

// Translate list filters into a Prisma where clause (tenant-scoped).
function buildWhere(tenantId: string, f: CashTransactionListInput): Prisma.CashTransactionWhereInput {
  const where: Prisma.CashTransactionWhereInput = { tenantId };
  if (f.issuingEntityId) where.issuingEntityId = f.issuingEntityId;
  if (f.accountId) where.accountId = f.accountId;
  if (f.categoryId) where.categoryId = f.categoryId;
  if (f.departmentId) where.departmentId = f.departmentId;
  if (f.direction) where.direction = f.direction;
  if (f.status) where.status = f.status;
  if (f.dateFrom || f.dateTo) {
    where.occurredAt = {};
    if (f.dateFrom) where.occurredAt.gte = new Date(f.dateFrom);
    if (f.dateTo) where.occurredAt.lte = new Date(`${f.dateTo}T23:59:59.999Z`);
  }
  if (f.search) {
    where.OR = [
      { description: { contains: f.search, mode: 'insensitive' } },
      { reference: { contains: f.search, mode: 'insensitive' } },
    ];
  }
  return where;
}

export const cashTransactionRepository = {
  async findMany(tenantId: string, f: CashTransactionListInput) {
    const where = buildWhere(tenantId, f);
    return db.cashTransaction.findMany({
      where,
      include: withRefs,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      skip: (f.page - 1) * f.limit,
      take: f.limit,
    });
  },

  async count(tenantId: string, f: CashTransactionListInput) {
    return db.cashTransaction.count({ where: buildWhere(tenantId, f) });
  },

  // Totals of ACTUAL rows matching the filter, split by direction (for the list footer).
  async totals(tenantId: string, f: CashTransactionListInput) {
    const grouped = await db.cashTransaction.groupBy({
      by: ['direction'],
      where: { ...buildWhere(tenantId, f), status: 'ACTUAL' },
      _sum: { amount: true },
    });
    let totalIn = 0;
    let totalOut = 0;
    for (const g of grouped) {
      const sum = Number(g._sum.amount ?? 0);
      if (g.direction === 'IN') totalIn = sum;
      else totalOut = sum;
    }
    return { totalIn, totalOut };
  },

  async findById(id: string, tenantId: string) {
    return db.cashTransaction.findFirst({ where: { id, tenantId }, include: withRefs });
  },
};

// Recompute an account's currentBalance from scratch = openingBalance + Σ(ACTUAL IN)
// − Σ(ACTUAL OUT). Runs inside the caller's transaction so balance never drifts from
// the ledger, even under concurrent edits. Recomputing (vs. incremental deltas) is
// deliberately simple and self-healing.
export async function recomputeAccountBalance(tx: TxClient, accountId: string): Promise<void> {
  const account = await tx.fundAccount.findUnique({ where: { id: accountId } });
  if (!account) return;
  const grouped = await tx.cashTransaction.groupBy({
    by: ['direction'],
    where: { accountId, status: 'ACTUAL' },
    _sum: { amount: true },
  });
  let inSum = 0;
  let outSum = 0;
  for (const g of grouped) {
    const sum = Number(g._sum.amount ?? 0);
    if (g.direction === 'IN') inSum = sum;
    else outSum = sum;
  }
  const balance = Number(account.openingBalance) + inSum - outSum;
  await tx.fundAccount.update({ where: { id: accountId }, data: { currentBalance: balance } });
}
