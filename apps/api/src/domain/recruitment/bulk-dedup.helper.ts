/**
 * Soft duplicate detection for staged bulk-import CVs. This NEVER blocks an
 * import — it only flags a likely duplicate and picks a sensible default
 * resolution so HR reviews rather than fights the system.
 *
 * Hard keys (email, phone) against an existing candidate are confident enough to
 * default to LINK_EXISTING. A fuzzy name match, or a collision with another CV
 * in the same batch, is a weaker signal: we flag it but keep resolution NEW so
 * HR decides.
 */

import type { BulkImportItemResolution } from '@prisma/client';
import { normalizeName, normalizePhone } from './candidate-normalize.js';

export interface DedupInput {
  email?: string | null;
  phone?: string | null;
  fullName?: string | null;
}

/** Existing candidate, reduced to the fields dedupe compares against. */
export interface DedupCandidate {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string;
}

/** Another not-yet-confirmed item in the same batch. */
export interface DedupSibling {
  email?: string | null;
  phone?: string | null;
}

export type DedupReason = 'EMAIL' | 'PHONE' | 'NAME' | 'BATCH_EMAIL' | 'BATCH_PHONE';

export interface DedupResult {
  resolution: BulkImportItemResolution;
  duplicateOfCandidateId: string | null;
  duplicateReason: DedupReason | null;
}

function normEmail(raw: string | null | undefined): string | null {
  const v = raw?.trim().toLowerCase();
  return v ? v : null;
}

/**
 * Decide the duplicate flags for one parsed CV. Pure: callers pass the existing
 * candidate pool and the batch siblings, so this is fully unit-testable without
 * a database. Precedence favours hard keys we can act on:
 *   existing email → existing phone → batch email → batch phone → existing name.
 */
export function computeDedup(
  input: DedupInput,
  existing: DedupCandidate[],
  siblings: DedupSibling[]
): DedupResult {
  const email = normEmail(input.email);
  const phone = normalizePhone(input.phone);
  const nameKey = normalizeName(input.fullName);

  if (email) {
    const match = existing.find((c) => normEmail(c.email) === email);
    if (match) {
      return { resolution: 'LINK_EXISTING', duplicateOfCandidateId: match.id, duplicateReason: 'EMAIL' };
    }
  }

  if (phone) {
    const match = existing.find((c) => normalizePhone(c.phone) === phone);
    if (match) {
      return { resolution: 'LINK_EXISTING', duplicateOfCandidateId: match.id, duplicateReason: 'PHONE' };
    }
  }

  // Intra-batch collisions: no candidate exists yet to link, so flag for HR and
  // keep NEW. HR resolves which one wins before confirming.
  if (email && siblings.some((s) => normEmail(s.email) === email)) {
    return { resolution: 'NEW', duplicateOfCandidateId: null, duplicateReason: 'BATCH_EMAIL' };
  }
  if (phone && siblings.some((s) => normalizePhone(s.phone) === phone)) {
    return { resolution: 'NEW', duplicateOfCandidateId: null, duplicateReason: 'BATCH_PHONE' };
  }

  // Weak signal: same normalized name as an existing candidate. Flag but stay
  // NEW — names collide far more often than emails.
  if (nameKey) {
    const match = existing.find((c) => normalizeName(c.fullName) === nameKey);
    if (match) {
      return { resolution: 'NEW', duplicateOfCandidateId: match.id, duplicateReason: 'NAME' };
    }
  }

  return { resolution: 'NEW', duplicateOfCandidateId: null, duplicateReason: null };
}
