import { Prisma } from '@prisma/client';

const D = Prisma.Decimal;
type Num = string | number | Prisma.Decimal;

export interface LineInput {
  quantity: Num;
  unitPrice: Num;
  discountPct: Num;
}

/** lineTotal = quantity × unitPrice × (1 − discountPct/100), rounded to 2 dp. */
export function computeLineTotal(quantity: Num, unitPrice: Num, discountPct: Num): Prisma.Decimal {
  const factor = new D(1).minus(new D(discountPct).div(100));
  return new D(quantity).mul(unitPrice).mul(factor).toDecimalPlaces(2);
}

/** Quote total = Σ lineTotal. */
export function computeQuoteTotal(items: LineInput[]): Prisma.Decimal {
  return items.reduce(
    (sum, it) => sum.plus(computeLineTotal(it.quantity, it.unitPrice, it.discountPct)),
    new D(0),
  );
}
