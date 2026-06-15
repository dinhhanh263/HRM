import { PositionLevel } from '@hrm/shared';

export const LEVEL_OPTIONS = [
  { value: PositionLevel.JUNIOR, labelKey: 'level.junior' },
  { value: PositionLevel.MID, labelKey: 'level.mid' },
  { value: PositionLevel.SENIOR, labelKey: 'level.senior' },
  { value: PositionLevel.LEAD, labelKey: 'level.lead' },
  { value: PositionLevel.MANAGER, labelKey: 'level.manager' },
] as const;

/**
 * Resolves a position level to its i18n key. For known levels this is a static
 * key (e.g. 'level.junior'). Unknown levels fall back to 'level.unknown', which
 * expects a `level` interpolation value when passed to t().
 */
export function getLevelKey(level: number): string {
  return LEVEL_OPTIONS.find((o) => o.value === level)?.labelKey ?? 'level.unknown';
}
