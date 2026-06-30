import type { Prisma } from '@prisma/client';

/**
 * Normalize a Vietnamese phone number to E.164 (`+84…`) so dedupe compares a
 * canonical form. Strips spaces/dots/dashes/parens. Returns null when there are
 * too few digits to be a real number (caller stores null = "no phone").
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s.\-()]/g, '');
  // Keep a single leading + then digits only.
  const hasPlus = cleaned.startsWith('+');
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 8) return null;

  let national: string;
  if (hasPlus && digits.startsWith('84')) national = digits.slice(2);
  else if (digits.startsWith('84') && digits.length >= 10) national = digits.slice(2);
  else if (digits.startsWith('0')) national = digits.slice(1);
  else national = digits;

  return `+84${national}`;
}

export interface CustomerScope {
  canViewAll: boolean;
  employeeId: string | null;
}

/**
 * Server-side visibility fragment for Customer queries. `view_all` sees everything;
 * otherwise a caller sees records they own OR the unassigned Lead Pool (ownerId null).
 * A profile-less caller (no Employee) without view_all sees only the Lead Pool.
 */
export function buildCustomerScopeWhere(scope: CustomerScope): Prisma.CustomerWhereInput {
  if (scope.canViewAll) return {};
  const or: Prisma.CustomerWhereInput[] = [];
  if (scope.employeeId) or.push({ ownerId: scope.employeeId });
  or.push({ ownerId: null });
  return { OR: or };
}
