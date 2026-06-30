import { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';
import { BadRequestError, NotFoundError } from '../../shared/errors/index.js';
import { computeLineTotal, computeQuoteTotal } from './quote-calc.js';
import { toQuoteDto } from './mappers.js';
import type { CreateQuoteInput, UpdateQuoteInput } from '../../app/validators/sales-quote.validator.js';

type Tx = Prisma.TransactionClient;

const quoteInclude = { items: { include: { product: { select: { id: true, name: true } } } } } satisfies Prisma.QuoteInclude;

/** Deal.amount is ALWAYS the total of the deal's primary quote (or 0 if none). */
async function recomputeDealAmount(tx: Tx, dealId: string): Promise<void> {
  const primary = await tx.quote.findFirst({ where: { dealId, isPrimary: true }, select: { total: true } });
  await tx.deal.update({ where: { id: dealId }, data: { amount: primary?.total ?? new Prisma.Decimal(0) } });
}

async function assertDeal(tx: Tx, tenantId: string, dealId: string) {
  const deal = await tx.deal.findFirst({ where: { id: dealId, tenantId }, select: { id: true } });
  if (!deal) throw new BadRequestError('Cơ hội không hợp lệ');
}

function buildItemRows(items: CreateQuoteInput['items']) {
  return items.map((it) => ({
    productId: it.productId ?? null,
    description: it.description ?? null,
    quantity: new Prisma.Decimal(it.quantity),
    unitPrice: new Prisma.Decimal(it.unitPrice),
    discountPct: new Prisma.Decimal(it.discountPct ?? 0),
    lineTotal: computeLineTotal(it.quantity, it.unitPrice, it.discountPct ?? 0),
  }));
}

async function nextQuoteCode(tx: Tx, dealId: string): Promise<string> {
  const n = await tx.quote.count({ where: { dealId } });
  return `BG${String(n + 1).padStart(3, '0')}`;
}

export const quoteService = {
  async listByDeal(tenantId: string, dealId: string) {
    await assertDeal(db, tenantId, dealId);
    const rows = await db.quote.findMany({ where: { tenantId, dealId }, include: quoteInclude, orderBy: { createdAt: 'asc' } });
    return rows.map(toQuoteDto);
  },

  async get(tenantId: string, quoteId: string) {
    const row = await db.quote.findFirst({ where: { id: quoteId, tenantId }, include: quoteInclude });
    if (!row) throw new NotFoundError('Không tìm thấy báo giá');
    return toQuoteDto(row);
  },

  async create(tenantId: string, dealId: string, input: CreateQuoteInput) {
    const rows = buildItemRows(input.items);
    const total = computeQuoteTotal(input.items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice, discountPct: i.discountPct ?? 0 })));
    const isPrimary = input.isPrimary ?? true;

    const quote = await db.$transaction(async (tx) => {
      await assertDeal(tx, tenantId, dealId);
      if (isPrimary) {
        await tx.quote.updateMany({ where: { dealId, isPrimary: true }, data: { isPrimary: false } });
      }
      const created = await tx.quote.create({
        data: {
          tenantId,
          dealId,
          code: await nextQuoteCode(tx, dealId),
          status: input.status ?? 'DRAFT',
          isPrimary,
          validUntil: input.validUntil ? new Date(input.validUntil) : null,
          issuingEntityId: input.issuingEntityId ?? null,
          total,
          items: { create: rows },
        },
        include: quoteInclude,
      });
      await recomputeDealAmount(tx, dealId);
      return created;
    });
    return toQuoteDto(quote);
  },

  async update(tenantId: string, quoteId: string, input: UpdateQuoteInput) {
    const quote = await db.$transaction(async (tx) => {
      const existing = await tx.quote.findFirst({ where: { id: quoteId, tenantId }, select: { id: true, dealId: true } });
      if (!existing) return null;

      const data: Prisma.QuoteUpdateInput = {};
      if (input.status !== undefined) data.status = input.status;
      if (input.validUntil !== undefined) data.validUntil = input.validUntil ? new Date(input.validUntil) : null;
      if (input.issuingEntityId !== undefined) {
        data.issuingEntity = input.issuingEntityId ? { connect: { id: input.issuingEntityId } } : { disconnect: true };
      }

      // Replacing items recomputes the quote total.
      if (input.items) {
        await tx.quoteItem.deleteMany({ where: { quoteId } });
        const rows = buildItemRows(input.items);
        await tx.quoteItem.createMany({ data: rows.map((r) => ({ ...r, quoteId })) });
        data.total = computeQuoteTotal(input.items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice, discountPct: i.discountPct ?? 0 })));
      }

      if (input.isPrimary === true) {
        await tx.quote.updateMany({ where: { dealId: existing.dealId, isPrimary: true, id: { not: quoteId } }, data: { isPrimary: false } });
        data.isPrimary = true;
      } else if (input.isPrimary === false) {
        data.isPrimary = false;
      }

      await tx.quote.update({ where: { id: quoteId }, data });
      await recomputeDealAmount(tx, existing.dealId);
      return tx.quote.findFirst({ where: { id: quoteId }, include: quoteInclude });
    });
    if (!quote) throw new NotFoundError('Không tìm thấy báo giá');
    return toQuoteDto(quote);
  },

  /** Assemble everything the quote PDF needs (entity, customer, deal title, items). */
  async pdfData(tenantId: string, quoteId: string) {
    const q = await db.quote.findFirst({
      where: { id: quoteId, tenantId },
      include: {
        items: { include: { product: { select: { name: true } } } },
        issuingEntity: true,
        deal: { include: { customer: { select: { fullName: true } } } },
      },
    });
    if (!q) throw new NotFoundError('Không tìm thấy báo giá');
    return {
      code: q.code,
      createdAt: q.createdAt,
      validUntil: q.validUntil,
      currency: 'VND',
      total: q.total.toString(),
      entity: q.issuingEntity
        ? { name: q.issuingEntity.name, address: q.issuingEntity.address, taxCode: q.issuingEntity.taxCode, phone: q.issuingEntity.phone }
        : null,
      customerName: q.deal.customer?.fullName ?? '—',
      dealTitle: q.deal.title,
      items: q.items.map((it) => ({
        description: it.description ?? it.product?.name ?? '—',
        quantity: it.quantity.toString(),
        unitPrice: it.unitPrice.toString(),
        discountPct: it.discountPct.toString(),
        lineTotal: it.lineTotal.toString(),
      })),
    };
  },

  async remove(tenantId: string, quoteId: string) {
    await db.$transaction(async (tx) => {
      const existing = await tx.quote.findFirst({ where: { id: quoteId, tenantId }, select: { dealId: true } });
      if (!existing) throw new NotFoundError('Không tìm thấy báo giá');
      await tx.quote.delete({ where: { id: quoteId } });
      await recomputeDealAmount(tx, existing.dealId);
    });
  },
};
