/** Format an ISO date string as dd/MM/yyyy (UTC-based). */
export function formatPurchaseDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

/** Per-line subtotal = quantity × unitPrice (rounded to 2 decimals). */
export function lineSubtotal(quantity: number, unitPrice: number): number {
  const q = Number.isFinite(quantity) ? quantity : 0;
  const p = Number.isFinite(unitPrice) ? unitPrice : 0;
  return round2(q * p);
}

/** Per-line VAT = subtotal × taxRate / 100 (rounded to 2 decimals). */
export function lineTax(subtotal: number, taxRate: number): number {
  const r = Number.isFinite(taxRate) ? taxRate : 0;
  return round2((subtotal * r) / 100);
}

/**
 * Round to 2 decimals. MUST match the server's `round2`
 * (apps/api/src/domain/services/purchase-request.service.ts) exactly so the
 * form footer never disagrees with the persisted total on half-cent boundaries.
 * The relative-epsilon nudge makes half-up rounding deterministic at currency
 * magnitudes (plain `Math.round(n*100)/100` truncates e.g. 49.974999… → 49.97).
 */
export function round2(n: number): number {
  const scaled = n * 100;
  return Math.round(scaled + Math.sign(scaled) * 1e-6) / 100;
}
