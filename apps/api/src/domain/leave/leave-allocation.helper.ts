/**
 * Pure pro-rata math for first-year leave allocation. No I/O so it is trivially
 * unit-testable.
 *
 * The join month is counted inclusively: an employee joining in November gets
 * `defaultDays * 2/12` (November + December). Earlier join years grant the full
 * allocation; years before the join year grant nothing. The result is rounded to
 * the nearest half day and clamped to `[0, defaultDays]`.
 */
export function computeProratedDays(defaultDays: number, joinDate: Date, year: number): number {
  if (defaultDays <= 0) return 0;

  const joinYear = joinDate.getUTCFullYear();
  if (joinYear > year) return 0; // hired after the year in question
  if (joinYear < year) return defaultDays; // already on board for the full year

  const joinMonth = joinDate.getUTCMonth() + 1; // 1..12
  const monthsRemaining = 13 - joinMonth; // inclusive of the join month

  const raw = (defaultDays * monthsRemaining) / 12;
  const roundedToHalf = Math.round(raw * 2) / 2;

  return Math.min(defaultDays, Math.max(0, roundedToHalf));
}
