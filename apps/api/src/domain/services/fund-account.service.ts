import type { Prisma } from '@prisma/client';
import { fundAccountRepository } from '../repositories/fund-account.repository.js';
import { db } from '../../infrastructure/database/client.js';
import { NotFoundError, BadRequestError, ConflictError } from '../../shared/errors/index.js';
import type {
  FundAccountDto,
  CreateFundAccountRequest,
  UpdateFundAccountRequest,
  FundAccountListQuery,
} from '@hrm/shared';

type FundAccountRow = Prisma.FundAccountGetPayload<{
  include: { issuingEntity: { select: { name: true } } };
}>;

function toDto(a: FundAccountRow): FundAccountDto {
  return {
    id: a.id,
    issuingEntityId: a.issuingEntityId,
    issuingEntityName: a.issuingEntity.name,
    name: a.name,
    type: a.type,
    currency: a.currency,
    openingBalance: a.openingBalance.toString(),
    currentBalance: a.currentBalance.toString(),
    active: a.active,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

// Guard: the picked entity must belong to the caller's tenant, else a caller could
// attach a fund to another tenant's legal entity.
async function assertEntity(issuingEntityId: string, tenantId: string): Promise<void> {
  const entity = await db.issuingEntity.findFirst({ where: { id: issuingEntityId, tenantId } });
  if (!entity) throw new BadRequestError('Pháp nhân không hợp lệ', 'FUND_ACCOUNT_INVALID_ENTITY');
}

export const fundAccountService = {
  async list(tenantId: string, query: FundAccountListQuery): Promise<FundAccountDto[]> {
    const rows = await fundAccountRepository.findAll(tenantId, {
      issuingEntityId: query.issuingEntityId,
      active: query.active,
    });
    return rows.map(toDto);
  },

  async getById(id: string, tenantId: string): Promise<FundAccountDto> {
    const row = await fundAccountRepository.findById(id, tenantId);
    if (!row) throw new NotFoundError('Không tìm thấy tài khoản quỹ');
    return toDto(row);
  },

  async create(tenantId: string, input: CreateFundAccountRequest): Promise<FundAccountDto> {
    await assertEntity(input.issuingEntityId, tenantId);
    const opening = input.openingBalance ?? 0;
    const created = await fundAccountRepository.create({
      tenantId,
      issuingEntityId: input.issuingEntityId,
      name: input.name.trim(),
      type: input.type,
      currency: input.currency?.trim() || 'VND',
      openingBalance: opening,
      currentBalance: opening, // no transactions yet → balance == opening
    });
    return toDto(created);
  },

  async update(id: string, tenantId: string, input: UpdateFundAccountRequest): Promise<FundAccountDto> {
    const existing = await fundAccountRepository.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Không tìm thấy tài khoản quỹ');

    const data: Prisma.FundAccountUncheckedUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.type !== undefined) data.type = input.type;
    if (input.currency !== undefined) data.currency = input.currency.trim() || 'VND';
    if (input.active !== undefined) data.active = input.active;
    // Changing openingBalance shifts the whole balance by the delta so currentBalance
    // stays consistent with the ledger (currentBalance = opening + net actual moves).
    if (input.openingBalance !== undefined) {
      const delta = input.openingBalance - Number(existing.openingBalance);
      data.openingBalance = input.openingBalance;
      data.currentBalance = { increment: delta };
    }

    const updated = await fundAccountRepository.update(id, tenantId, data);
    return toDto(updated);
  },

  // Hard-delete only when unused; otherwise the account carries history → deactivate.
  async remove(id: string, tenantId: string): Promise<void> {
    const existing = await fundAccountRepository.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Không tìm thấy tài khoản quỹ');
    const txCount = await fundAccountRepository.countTransactions(id);
    if (txCount > 0) {
      throw new ConflictError(
        'Tài khoản đã có giao dịch — hãy vô hiệu hoá thay vì xoá',
        'FUND_ACCOUNT_HAS_TRANSACTIONS',
      );
    }
    await fundAccountRepository.delete(id, tenantId);
  },
};
