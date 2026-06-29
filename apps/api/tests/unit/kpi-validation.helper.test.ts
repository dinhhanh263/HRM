import { describe, it, expect } from 'vitest';
import {
  sumWeights,
  isComplete100,
  collectFrameworkWeightIssues,
  type FrameworkIntegrityInput,
} from '../../src/domain/kpi/validation.helper.js';

describe('sumWeights', () => {
  it('sums numbers', () => {
    expect(sumWeights([35, 25, 25, 15])).toBe(100);
  });
  it('treats empty as 0', () => {
    expect(sumWeights([])).toBe(0);
  });
});

describe('isComplete100', () => {
  it('accepts exactly 100', () => {
    expect(isComplete100(100)).toBe(true);
  });
  it('tolerates tiny float drift', () => {
    expect(isComplete100(99.999)).toBe(true);
    expect(isComplete100(100.001)).toBe(true);
  });
  it('rejects clearly off values', () => {
    expect(isComplete100(90)).toBe(false);
    expect(isComplete100(110)).toBe(false);
  });
});

describe('collectFrameworkWeightIssues', () => {
  const valid: FrameworkIntegrityInput = {
    pillars: [
      { id: 'p1', name: 'Delivery', weight: 35, kpiWeights: [25, 25, 25, 25] },
      { id: 'p2', name: 'Quality', weight: 25, kpiWeights: [50, 50] },
      { id: 'p3', name: 'Process', weight: 25, kpiWeights: [100] },
      { id: 'p4', name: 'Team Health', weight: 15, kpiWeights: [] }, // empty pillar = chưa có KPI, bỏ qua
    ],
    profiles: [
      { id: 'pr1', name: 'Dev', pillarWeights: [40, 30, 20, 10] },
    ],
  };

  it('reports no issues for a balanced framework', () => {
    expect(collectFrameworkWeightIssues(valid)).toEqual([]);
  });

  it('flags pillar weights not summing to 100', () => {
    const bad: FrameworkIntegrityInput = {
      ...valid,
      pillars: [
        { id: 'p1', name: 'Delivery', weight: 40, kpiWeights: [100] },
        { id: 'p2', name: 'Quality', weight: 40, kpiWeights: [100] },
      ],
    };
    const issues = collectFrameworkWeightIssues(bad);
    expect(issues.some((i) => i.scope === 'PILLARS' && i.actualSum === 80)).toBe(true);
  });

  it('flags a pillar whose KPI weights miss 100', () => {
    const bad: FrameworkIntegrityInput = {
      pillars: [{ id: 'p1', name: 'Delivery', weight: 100, kpiWeights: [30, 30] }],
      profiles: [],
    };
    const issues = collectFrameworkWeightIssues(bad);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ scope: 'PILLAR_KPIS', refId: 'p1', actualSum: 60 });
  });

  it('flags a weight profile not summing to 100', () => {
    const bad: FrameworkIntegrityInput = {
      pillars: [{ id: 'p1', name: 'X', weight: 100, kpiWeights: [100] }],
      profiles: [{ id: 'pr1', name: 'Broken', pillarWeights: [50, 30] }],
    };
    const issues = collectFrameworkWeightIssues(bad);
    expect(issues.some((i) => i.scope === 'PROFILE' && i.refId === 'pr1' && i.actualSum === 80)).toBe(true);
  });

  it('skips empty framework (no pillars) — nothing to validate yet', () => {
    expect(collectFrameworkWeightIssues({ pillars: [], profiles: [] })).toEqual([]);
  });
});
