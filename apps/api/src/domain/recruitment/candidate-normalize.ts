/**
 * Candidate dedupe relies on two stable keys: a phone in E.164 form and a
 * diacritic-insensitive name key. Both are computed here so the same input
 * always maps to the same key regardless of how a recruiter typed it.
 */

const E164_RE = /^\+\d{8,15}$/;

/**
 * Normalize a phone number to E.164 (default country: Vietnam, +84).
 * Returns null when the input cannot be coerced into a plausible number, so
 * callers can skip phone-based dedupe instead of matching on garbage.
 */
export function normalizePhone(
  raw: string | null | undefined,
  defaultCountryCode = '84'
): string | null {
  if (!raw) return null;

  // Keep digits and a single leading +; drop spaces, dashes, dots, parens.
  let cleaned = raw.trim().replace(/[\s().-]/g, '');
  if (!cleaned) return null;

  if (cleaned.startsWith('+')) {
    cleaned = '+' + cleaned.slice(1).replace(/\D/g, '');
  } else if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2).replace(/\D/g, '');
  } else {
    cleaned = cleaned.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '+' + defaultCountryCode + cleaned.slice(1);
    } else if (cleaned.startsWith(defaultCountryCode)) {
      cleaned = '+' + cleaned;
    } else {
      cleaned = '+' + defaultCountryCode + cleaned;
    }
  }

  return E164_RE.test(cleaned) ? cleaned : null;
}

/**
 * Build a diacritic-insensitive, lowercase, whitespace-collapsed key from a
 * name for fuzzy duplicate detection (e.g. "Nguyễn Văn Á" → "nguyen van a").
 */
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
