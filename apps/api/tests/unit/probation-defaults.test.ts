import { describe, it, expect } from 'vitest';
import { DEFAULT_PROBATION_CRITERIA } from '../../src/domain/probation/defaults.js';

// SPEC-031: bộ seed mặc định = 6 năng lực hiện đại (2025–2026), tách What/How qua
// `group` và mỗi tiêu chí kèm rubric BARS đúng 5 mức (score 1..5, không trùng).
// Các bất biến này là hợp đồng với validator (Slice 3) và UI popover (Slice 5).

describe('DEFAULT_PROBATION_CRITERIA (SPEC-031)', () => {
  it('contains exactly the 6 modern competencies in display order', () => {
    expect(DEFAULT_PROBATION_CRITERIA.map((c) => c.name)).toEqual([
      'Chuyên môn & Tốc độ hòa nhập',
      'Chất lượng công việc',
      'Chủ động & Sở hữu công việc',
      'Giao tiếp & Phối hợp',
      'Thích nghi & Học hỏi',
      'Phù hợp văn hóa & Giá trị',
    ]);
    expect(DEFAULT_PROBATION_CRITERIA.map((c) => c.order)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('separates What/How: 5 PERFORMANCE + 1 VALUES (culture fit)', () => {
    const groups = DEFAULT_PROBATION_CRITERIA.map((c) => c.group);
    expect(groups.filter((g) => g === 'PERFORMANCE')).toHaveLength(5);
    expect(groups.filter((g) => g === 'VALUES')).toHaveLength(1);
    expect(DEFAULT_PROBATION_CRITERIA.at(-1)?.group).toBe('VALUES');
  });

  for (const criterion of DEFAULT_PROBATION_CRITERIA) {
    it(`"${criterion.name}" has a valid 5-level BARS rubric`, () => {
      expect(criterion.rubric).toHaveLength(5);
      // scores 1..5, đúng thứ tự, không trùng — khớp thang chấm SPEC-030.
      expect(criterion.rubric.map((l) => l.score)).toEqual([1, 2, 3, 4, 5]);
      for (const level of criterion.rubric) {
        expect(level.level.length).toBeGreaterThan(0);
        expect(level.level.length).toBeLessThanOrEqual(120);
        expect(level.definition && level.definition.length).toBeGreaterThan(0);
        expect(level.observable && level.observable.length).toBeGreaterThan(0);
      }
    });
  }
});
