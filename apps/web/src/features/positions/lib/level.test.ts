import { describe, it, expect } from 'vitest';
import { PositionLevel } from '@hrm/shared';
import { LEVEL_OPTIONS, getLevelKey } from './level';

describe('LEVEL_OPTIONS', () => {
  it('lists all five levels with i18n keys', () => {
    expect(LEVEL_OPTIONS).toHaveLength(5);
    expect(LEVEL_OPTIONS.map((o) => o.value)).toEqual([
      PositionLevel.JUNIOR,
      PositionLevel.MID,
      PositionLevel.SENIOR,
      PositionLevel.LEAD,
      PositionLevel.MANAGER,
    ]);
  });
});

describe('getLevelKey', () => {
  it('maps a known level to its key', () => {
    expect(getLevelKey(PositionLevel.SENIOR)).toBe('level.senior');
    expect(getLevelKey(PositionLevel.MANAGER)).toBe('level.manager');
  });

  it('falls back to level.unknown for an unknown level', () => {
    expect(getLevelKey(999)).toBe('level.unknown');
  });
});
