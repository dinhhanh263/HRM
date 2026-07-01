import type { Prisma } from '@prisma/client';
import { topUpRequestRepository } from '../repositories/topup-request.repository.js';
import { recomputeAccountBalance } from '../repositories/cash-transaction.repository.js';
import { financeReportService } from './finance-report.service.js';
import { renderTopUpPdf } from '../topup-request/topup.pdf.js';
import { db } from '../../infrastructure/database/client.js';
import { NotFoundError, BadRequestError, ConflictError } from '../../shared/errors/index.js';
import type {
  TopUpRequestDto,
  TopUpJustificationDraft,
  CreateTopUpRequest,
  ReviewTopUpRequest,
} from '@hrm/shared';
import type { TopUpRequestListInput } from '../../app/validators/topup-request.validator.js';

// Actor: only userId matters (company-wide feature; capability gated in controller).
export interface TopUpActor {
  userId: string;
  isSuperAdmin: boolean;
}

type Row = Prisma.TopUpRequestGetPayload<{
  include: { issuingEntity: { select: { name: true } }; fundedAccount: { select: { name: true } } };
}>;

function toDto(r: Row, creators: Map<string, { fullName: string; email: string }>): TopUpRequestDto {
  const creator = creators.get(r.createdById);
  return {
    id: r.id,
    issuingEntityId: r.issuingEntityId,
    issuingEntityName: r.issuingEntity.name,
    title: r.title,
    amount: r.amount.toString(),
    currency: r.currency,
    neededByDate: r.neededByDate?.toISOString() ?? null,
    period: r.period,
    justification: r.justification,
    status: r.status,
    reviewedById: r.reviewedById,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    reviewNote: r.reviewNote,
    fundedAccountId: r.fundedAccountId,
    fundedAccountName: r.fundedAccount?.name ?? null,
    fundedAt: r.fundedAt?.toISOString() ?? null,
    createdById: r.createdById,
    createdByName: creator?.fullName ?? null,
    createdByEmail: creator?.email ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function creatorMap(rows: Row[], tenantId: string) {
  const ids = [...new Set(rows.map((r) => r.createdById))];
  if (!ids.length) return new Map<string, { fullName: string; email: string }>();
  const users = await db.user.findMany({ where: { id: { in: ids }, tenantId }, select: { id: true, fullName: true, email: true } });
  return new Map(users.map((u) => [u.id, { fullName: u.fullName, email: u.email }]));
}

async function assertEntity(issuingEntityId: string, tenantId: string) {
  const e = await db.issuingEntity.findFirst({ where: { id: issuingEntityId, tenantId } });
  if (!e) throw new BadRequestError('Pháp nhân không hợp lệ', 'TOPUP_INVALID_ENTITY');
  return e;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(n));
}

export const topUpRequestService = {
  // Suggest a justification from the period's approved plans + forecast shortfall.
  async justificationDraft(
    tenantId: string,
    opts: { issuingEntityId?: string; month?: string },
  ): Promise<TopUpJustificationDraft> {
    const [bva, forecast] = await Promise.all([
      financeReportService.budgetVsActual(tenantId, opts),
      financeReportService.forecast(tenantId, opts),
    ]);
    const shortfall = Number(forecast.shortfall);
    const totalPlanned = Number(bva.totalPlanned);
    const lines = [
      `Đề xuất nạp quỹ cho kỳ ${forecast.period}.`,
      `Tổng kế hoạch chi đã duyệt: ${fmt(totalPlanned)} đ.`,
      forecast.cashOutDate
        ? `Dự báo dòng tiền: số dư dự kiến chạm 0 vào ngày ${forecast.cashOutDate}, thiếu hụt ${fmt(shortfall)} đ.`
        : `Dự báo dòng tiền hiện đủ; đề xuất nạp để dự phòng.`,
      `Đề nghị Founder phê duyệt nạp ${fmt(shortfall || totalPlanned)} đ để đảm bảo dòng tiền vận hành.`,
    ];
    return {
      period: forecast.period,
      totalPlanned: bva.totalPlanned,
      shortfall: forecast.shortfall,
      suggestedAmount: String(shortfall || totalPlanned),
      text: lines.join('\n'),
    };
  },

  async list(tenantId: string, query: TopUpRequestListInput): Promise<TopUpRequestDto[]> {
    const where: Prisma.TopUpRequestWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.issuingEntityId) where.issuingEntityId = query.issuingEntityId;
    const rows = await topUpRequestRepository.findMany(tenantId, where);
    const creators = await creatorMap(rows, tenantId);
    return rows.map((r) => toDto(r, creators));
  },

  async getById(id: string, tenantId: string): Promise<TopUpRequestDto> {
    const row = await topUpRequestRepository.findById(id, tenantId);
    if (!row) throw new NotFoundError('Không tìm thấy đề xuất nạp quỹ');
    const creators = await creatorMap([row], tenantId);
    return toDto(row, creators);
  },

  async create(tenantId: string, actor: TopUpActor, input: CreateTopUpRequest): Promise<TopUpRequestDto> {
    await assertEntity(input.issuingEntityId, tenantId);
    const created = await db.topUpRequest.create({
      data: {
        tenantId,
        issuingEntityId: input.issuingEntityId,
        title: input.title.trim(),
        amount: input.amount,
        currency: input.currency?.trim() || 'VND',
        neededByDate: input.neededByDate ? new Date(input.neededByDate) : null,
        period: input.period ?? null,
        justification: input.justification.trim(),
        status: 'PENDING',
        createdById: actor.userId,
      },
      select: { id: true },
    });
    return this.getById(created.id, tenantId);
  },

  // Render the justification as a PDF to submit/archive for the Founder.
  async pdf(id: string, tenantId: string): Promise<{ buffer: Buffer; filename: string }> {
    const row = await topUpRequestRepository.findById(id, tenantId);
    if (!row) throw new NotFoundError('Không tìm thấy đề xuất nạp quỹ');
    const userIds = [row.createdById, row.reviewedById].filter((x): x is string => !!x);
    const users = userIds.length
      ? await db.user.findMany({ where: { id: { in: userIds }, tenantId }, select: { id: true, fullName: true } })
      : [];
    const nameOf = (uid: string | null) => (uid ? users.find((u) => u.id === uid)?.fullName ?? null : null);

    const buffer = await renderTopUpPdf({
      entityName: row.issuingEntity.name,
      title: row.title,
      amount: row.amount.toString(),
      currency: row.currency,
      period: row.period,
      neededByDate: row.neededByDate,
      status: row.status,
      statusLabel: '',
      justification: row.justification,
      requesterName: nameOf(row.createdById),
      createdAt: row.createdAt,
      reviewedByName: nameOf(row.reviewedById),
      reviewNote: row.reviewNote,
      fundedAccountName: row.fundedAccount?.name ?? null,
    });
    return { buffer, filename: `de-xuat-nap-quy-${row.id}.pdf` };
  },

  async cancel(id: string, tenantId: string, actor: TopUpActor): Promise<TopUpRequestDto> {
    const existing = await topUpRequestRepository.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Không tìm thấy đề xuất nạp quỹ');
    if (!actor.isSuperAdmin && existing.createdById !== actor.userId) {
      throw new NotFoundError('Không tìm thấy đề xuất nạp quỹ');
    }
    if (existing.status !== 'PENDING') {
      throw new ConflictError('Chỉ huỷ được đề xuất đang chờ duyệt', 'TOPUP_NOT_CANCELLABLE');
    }
    await db.topUpRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
    return this.getById(id, tenantId);
  },

  // Founder decision. APPROVED + fundedAccountId → post an ACTUAL IN "Nạp quỹ"
  // transaction and recompute that account's balance, all in one transaction.
  async review(id: string, tenantId: string, actor: TopUpActor, input: ReviewTopUpRequest): Promise<TopUpRequestDto> {
    const existing = await topUpRequestRepository.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Không tìm thấy đề xuất nạp quỹ');
    if (existing.status !== 'PENDING') {
      throw new ConflictError('Chỉ duyệt được đề xuất đang chờ duyệt', 'TOPUP_NOT_REVIEWABLE');
    }
    if (input.decision === 'REJECTED' && !input.note?.trim()) {
      throw new BadRequestError('Cần nêu lý do khi từ chối', 'TOPUP_REJECT_NOTE_REQUIRED');
    }

    // Validate the funded account (must belong to the tenant) up-front.
    let account: { id: string; currency: string; issuingEntityId: string } | null = null;
    if (input.decision === 'APPROVED' && input.fundedAccountId) {
      const acc = await db.fundAccount.findFirst({ where: { id: input.fundedAccountId, tenantId } });
      if (!acc) throw new BadRequestError('Tài khoản quỹ không hợp lệ', 'TOPUP_INVALID_ACCOUNT');
      account = { id: acc.id, currency: acc.currency, issuingEntityId: acc.issuingEntityId };
    }

    // The dedicated "Nạp quỹ" income category, if the tenant has one.
    const topUpCategory = account
      ? await db.financeCategory.findFirst({ where: { tenantId, kind: 'INCOME', name: 'Nạp quỹ / Góp vốn' }, select: { id: true } })
      : null;

    await db.$transaction(async (tx) => {
      await tx.topUpRequest.update({
        where: { id },
        data: {
          status: input.decision,
          reviewedById: actor.userId,
          reviewedAt: new Date(),
          reviewNote: input.note?.trim() || null,
          ...(account ? { fundedAccountId: account.id, fundedAt: new Date() } : {}),
        },
      });
      if (input.decision === 'APPROVED' && account) {
        await tx.cashTransaction.create({
          data: {
            tenantId,
            accountId: account.id,
            issuingEntityId: account.issuingEntityId,
            direction: 'IN',
            status: 'ACTUAL',
            amount: existing.amount,
            currency: account.currency,
            occurredAt: new Date(),
            categoryId: topUpCategory?.id ?? null,
            description: `Nạp quỹ theo đề xuất: ${existing.title}`,
            source: 'MANUAL',
            sourceRefId: existing.id,
            createdById: actor.userId,
          },
        });
        await recomputeAccountBalance(tx, account.id);
      }
    });
    return this.getById(id, tenantId);
  },
};
