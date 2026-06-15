import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Money crosses the wire as a whole-VND string. Render it grouped, no decimals.
export function formatVnd(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('vi-VN').format(Math.round(n));
}

// Group an integer-ish string with comma thousand separators for money INPUTS
// (e.g. "10000000" → "10,000,000"). Strips every non-digit first, so it is safe
// to feed a partially-typed value straight back into a controlled input. Returns
// '' for an empty/zeroless string so the field can be cleared.
export function groupThousands(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return '';
  // Drop leading zeros (but keep a lone "0").
  const normalized = digits.replace(/^0+(?=\d)/, '');
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// "Nguyễn Văn A" → "NA"; falls back to the first character for single words.
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
