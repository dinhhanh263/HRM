/** Format an ISO date string as dd/MM/yyyy (UTC-based to match server day math). */
export function formatLeaveDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

/** Trim a number for display: 3 → "3", 0.5 → "0.5". */
export function formatDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
