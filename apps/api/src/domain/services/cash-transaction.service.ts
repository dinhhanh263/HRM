import type { Prisma } from '@prisma/client';
import {
  cashTransactionRepository,
  recomputeAccountBalance,
} from '../repositories/cash-transaction.repository.js';
import { db } from '../../infrastructure/database/client.js';
import { NotFoundError, BadRequestError } from '../../shared/errors/index.js';
import type {
  CashTransactionDto,
  CashTransactionListResponse,
  CreateCashTransactionRequest,
  UpdateCashTransactionRequest,
} from '@hrm/shared';
import type {
  CashTransactionListInput,
} from '../../app/validators/cash-transaction.validator.js';

type TxRow = Prisma.CashTransactionGetPayload<{
  include: {
    account: { select: { name: true } };
    issuingEntity: { select: { name: true } };
    category: { select: { name: true } };
    department: { select: { name: true } };
  };
}>;

function toDto(t: TxRow): CashTransactionDto {
  return {
    id: t.id,
    accountId: t.accountId,
    accountName: t.account.name,
    issuingEntityId: t.issuingEntityId,
    issuingEntityName: t.issuingEntity.name,
    direction: t.direction,
    status: t.status,
    amount: t.amount.toString(),
    currency: t.currency,
    occurredAt: t.occurredAt.toISOString(),
    categoryId: t.categoryId,
    categoryName: t.category?.name ?? null,
    departmentId: t.departmentId,
    departmentName: t.department?.name ?? null,
    description: t.description,
    reference: t.reference,
    source: t.source,
    createdById: t.createdById,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

// Fetch a tenant-scoped account or fail — also the source of a transaction's entity.
async function requireAccount(accountId: string, tenantId: string) {
  const account = await db.fundAccount.findFirst({ where: { id: accountId, tenantId } });
  if (!account) throw new BadRequestError('Tài khoản quỹ không hợp lệ', 'CASH_TX_INVALID_ACCOUNT');
  return account;
}

async function assertCategory(categoryId: string | null | undefined, tenantId: string) {
  if (!categoryId) return;
  const cat = await db.financeCategory.findFirst({ where: { id: categoryId, tenantId } });
  if (!cat) throw new BadRequestError('Danh mục không hợp lệ', 'CASH_TX_INVALID_CATEGORY');
}

async function assertDepartment(departmentId: string | null | undefined, tenantId: string) {
  if (!departmentId) return;
  const dep = await db.department.findFirst({ where: { id: departmentId, tenantId } });
  if (!dep) throw new BadRequestError('Phòng ban không hợp lệ', 'CASH_TX_INVALID_DEPARTMENT');
}

export const cashTransactionService = {
  async list(tenantId: string, query: CashTransactionListInput): Promise<CashTransactionListResponse> {
    const [rows, total, totals] = await Promise.all([
      cashTransactionRepository.findMany(tenantId, query),
      cashTransactionRepository.count(tenantId, query),
      cashTransactionRepository.totals(tenantId, query),
    ]);
    return {
      items: rows.map(toDto),
      total,
      page: query.page,
      limit: query.limit,
      totalIn: String(totals.totalIn),
      totalOut: String(totals.totalOut),
      net: String(totals.totalIn - totals.totalOut),
    };
  },

  async getById(id: string, tenantId: string): Promise<CashTransactionDto> {
    const row = await cashTransactionRepository.findById(id, tenantId);
    if (!row) throw new NotFoundError('Không tìm thấy giao dịch');
    return toDto(row);
  },

  async create(
    tenantId: string,
    userId: string,
    input: CreateCashTransactionRequest,
  ): Promise<CashTransactionDto> {
    const account = await requireAccount(input.accountId, tenantId);
    await assertCategory(input.categoryId, tenantId);
    await assertDepartment(input.departmentId, tenantId);

    const id = await db.$transaction(async (tx) => {
      const created = await tx.cashTransaction.create({
        data: {
          tenantId,
          accountId: account.id,
          issuingEntityId: account.issuingEntityId, // inherit entity from the account
          direction: input.direction,
          status: input.status ?? 'ACTUAL',
          amount: input.amount,
          currency: account.currency,
          occurredAt: new Date(input.occurredAt),
          categoryId: input.categoryId ?? null,
          departmentId: input.departmentId ?? null,
          description: input.description ?? null,
          reference: input.reference ?? null,
          createdById: userId,
        },
      });
      await recomputeAccountBalance(tx, account.id);
      return created.id;
    });
    return this.getById(id, tenantId);
  },

  async update(
    id: string,
    tenantId: string,
    input: UpdateCashTransactionRequest,
  ): Promise<CashTransactionDto> {
    const existing = await db.cashTransaction.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundError('Không tìm thấy giao dịch');

    // Resolve a target account when moving (also gives the new entity).
    const targetAccount =
      input.accountId && input.accountId !== existing.accountId
        ? await requireAccount(input.accountId, tenantId)
        : null;
    await assertCategory(input.categoryId, tenantId);
    await assertDepartment(input.departmentId, tenantId);

    await db.$transaction(async (tx) => {
      const data: Prisma.CashTransactionUncheckedUpdateInput = {};
      if (targetAccount) {
        data.accountId = targetAccount.id;
        data.issuingEntityId = targetAccount.issuingEntityId;
        data.currency = targetAccount.currency;
      }
      if (input.direction !== undefined) data.direction = input.direction;
      if (input.status !== undefined) data.status = input.status;
      if (input.amount !== undefined) data.amount = input.amount;
      if (input.occurredAt !== undefined) data.occurredAt = new Date(input.occurredAt);
      if (input.categoryId !== undefined) data.categoryId = input.categoryId;
      if (input.departmentId !== undefined) data.departmentId = input.departmentId;
      if (input.description !== undefined) data.description = input.description;
      if (input.reference !== undefined) data.reference = input.reference;

      await tx.cashTransaction.update({ where: { id }, data });
      // Recompute the origin account, plus the destination if the tx moved.
      await recomputeAccountBalance(tx, existing.accountId);
      if (targetAccount) await recomputeAccountBalance(tx, targetAccount.id);
    });
    return this.getById(id, tenantId);
  },

  async remove(id: string, tenantId: string): Promise<void> {
    const existing = await db.cashTransaction.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundError('Không tìm thấy giao dịch');
    await db.$transaction(async (tx) => {
      await tx.cashTransaction.delete({ where: { id } });
      await recomputeAccountBalance(tx, existing.accountId);
    });
  },
};
