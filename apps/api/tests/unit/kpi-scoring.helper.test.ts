import { describe, it, expect } from 'vitest';
import {
  scoreEntry,
  computePillarScore,
  computeOverall,
  resolveRating,
  computeScorecard,
  DEFAULT_ANCHORS,
  type ScoringDef,
  type RatingBand,
  type ScorecardPillarInput,
} from '../../src/domain/kpi/scoring.helper.js';

const linear = (over: Partial<ScoringDef>): ScoringDef => ({
  direction: 'HIGHER_BETTER',
  scoringMethod: 'THRESHOLD_LINEAR',
  targetValue: 90,
  minValue: 75,
  ...over,
});

describe('scoreEntry — THRESHOLD_LINEAR (HIGHER_BETTER)', () => {
  const def = linear({ targetValue: 90, minValue: 75 });

  it('maps actual=target to the target anchor (90)', () => {
    expect(scoreEntry(90, def, DEFAULT_ANCHORS)).toBe(90);
  });

  it('maps actual=min to the pass anchor (60)', () => {
    expect(scoreEntry(75, def, DEFAULT_ANCHORS)).toBe(60);
  });

  it('interpolates linearly between min and target (midpoint → 75)', () => {
    // halfway between min(75) and target(90) → halfway between 60 and 90 = 75
    expect(scoreEntry(82.5, def, DEFAULT_ANCHORS)).toBe(75);
  });

  it('drops below the pass anchor when actual < min', () => {
    const s = scoreEntry(60, def, DEFAULT_ANCHORS);
    expect(s).not.toBeNull();
    expect(s as number).toBeLessThan(60);
    expect(s as number).toBeGreaterThanOrEqual(0);
  });

  it('rises above 90 when actual exceeds target, capped at 100', () => {
    expect(scoreEntry(120, def, DEFAULT_ANCHORS)).toBe(100);
  });

  it('returns null when no actual recorded', () => {
    expect(scoreEntry(null, def, DEFAULT_ANCHORS)).toBeNull();
  });
});

describe('scoreEntry — THRESHOLD_LINEAR (LOWER_BETTER)', () => {
  // Defect Density: target 0.3 (tốt), min 0.5 (ngưỡng đạt) — thấp hơn là tốt.
  const def = linear({ direction: 'LOWER_BETTER', targetValue: 0.3, minValue: 0.5 });

  it('maps actual=target(0.3) to 90', () => {
    expect(scoreEntry(0.3, def, DEFAULT_ANCHORS)).toBe(90);
  });

  it('maps actual=min(0.5) to 60', () => {
    expect(scoreEntry(0.5, def, DEFAULT_ANCHORS)).toBe(60);
  });

  it('interpolates at midpoint (0.4 → 75)', () => {
    expect(scoreEntry(0.4, def, DEFAULT_ANCHORS)).toBe(75);
  });

  it('penalises worse-than-min (0.7 → 30)', () => {
    expect(scoreEntry(0.7, def, DEFAULT_ANCHORS)).toBe(30);
  });

  it('caps excellent values at 100 (0.1)', () => {
    expect(scoreEntry(0.1, def, DEFAULT_ANCHORS)).toBe(100);
  });
});

describe('scoreEntry — edge: target equals min', () => {
  const def = linear({ targetValue: 80, minValue: 80 });
  it('returns target anchor when meeting threshold', () => {
    expect(scoreEntry(85, def, DEFAULT_ANCHORS)).toBe(90);
  });
  it('returns pass anchor when below threshold', () => {
    expect(scoreEntry(70, def, DEFAULT_ANCHORS)).toBe(60);
  });
});

describe('scoreEntry — other methods', () => {
  it('DIRECT clamps the value into 0..100', () => {
    const def = linear({ scoringMethod: 'DIRECT', targetValue: null, minValue: null });
    expect(scoreEntry(73, def, DEFAULT_ANCHORS)).toBe(73);
    expect(scoreEntry(150, def, DEFAULT_ANCHORS)).toBe(100);
    expect(scoreEntry(-5, def, DEFAULT_ANCHORS)).toBe(0);
  });

  it('BOOLEAN maps truthy→100, zero→0', () => {
    const def = linear({ scoringMethod: 'BOOLEAN', targetValue: null, minValue: null });
    expect(scoreEntry(1, def, DEFAULT_ANCHORS)).toBe(100);
    expect(scoreEntry(0, def, DEFAULT_ANCHORS)).toBe(0);
  });

  it('THRESHOLD_LINEAR returns null when target/min not configured', () => {
    const def = linear({ targetValue: null, minValue: null });
    expect(scoreEntry(50, def, DEFAULT_ANCHORS)).toBeNull();
  });
});

describe('computePillarScore', () => {
  it('weighted average of KPI scores', () => {
    const score = computePillarScore([
      { score: 90, weight: 50 },
      { score: 60, weight: 50 },
    ]);
    expect(score).toBe(75);
  });

  it('skips null scores (partial entry) and reweights', () => {
    const score = computePillarScore([
      { score: 90, weight: 50 },
      { score: null, weight: 50 },
    ]);
    expect(score).toBe(90);
  });

  it('returns null when nothing scored', () => {
    expect(computePillarScore([{ score: null, weight: 50 }])).toBeNull();
  });

  it('skips zero-weight KPIs (weightInPillar default 0)', () => {
    // KpiDefinition.weightInPillar defaults to 0 → must not dilute the average.
    const score = computePillarScore([
      { score: 90, weight: 0 },
      { score: 60, weight: 50 },
    ]);
    expect(score).toBe(60);
  });
});

describe('computeOverall', () => {
  it('weights pillar scores by pillar weight', () => {
    // Delivery 35, Quality 25, Process 25, Health 15
    const overall = computeOverall([
      { score: 80, weight: 35 },
      { score: 90, weight: 25 },
      { score: 70, weight: 25 },
      { score: 100, weight: 15 },
    ]);
    // (80*35 + 90*25 + 70*25 + 100*15) / 100 = (2800+2250+1750+1500)/100 = 83
    expect(overall).toBe(83);
  });
});

describe('resolveRating', () => {
  const bands: RatingBand[] = [
    { label: 'Chưa đạt', minScore: 0, maxScore: 39 },
    { label: 'Cần cải thiện', minScore: 40, maxScore: 59 },
    { label: 'Đạt yêu cầu', minScore: 60, maxScore: 74 },
    { label: 'Tốt', minScore: 75, maxScore: 89 },
    { label: 'Xuất sắc', minScore: 90, maxScore: 100 },
  ];

  it('matches the correct band including boundaries', () => {
    expect(resolveRating(90, bands)).toBe('Xuất sắc');
    expect(resolveRating(83, bands)).toBe('Tốt');
    expect(resolveRating(60, bands)).toBe('Đạt yêu cầu');
    expect(resolveRating(0, bands)).toBe('Chưa đạt');
  });

  it('returns null for null score', () => {
    expect(resolveRating(null, bands)).toBeNull();
  });
});

describe('computeScorecard', () => {
  const bands: RatingBand[] = [
    { label: 'Đạt yêu cầu', minScore: 60, maxScore: 74 },
    { label: 'Tốt', minScore: 75, maxScore: 89 },
    { label: 'Xuất sắc', minScore: 90, maxScore: 100 },
  ];
  // 2 pillars: Delivery (base 70), Quality (base 30); mỗi pillar 2 KPI 50/50.
  const pillars: ScorecardPillarInput[] = [
    { pillarId: 'del', baseWeight: 70, definitions: [{ id: 'd1', weightInPillar: 50 }, { id: 'd2', weightInPillar: 50 }] },
    { pillarId: 'qua', baseWeight: 30, definitions: [{ id: 'q1', weightInPillar: 50 }, { id: 'q2', weightInPillar: 50 }] },
  ];

  it('computes pillar scores, weighted total and rating with base pillar weights', () => {
    const scores = new Map<string, number | null>([['d1', 90], ['d2', 70], ['q1', 80], ['q2', 100]]);
    const r = computeScorecard(pillars, scores, null, bands);
    // Delivery = (90+70)/2 = 80; Quality = (80+100)/2 = 90
    // Overall = (80*70 + 90*30)/100 = (5600+2700)/100 = 83 → "Tốt"
    expect(r.pillars.find((p) => p.pillarId === 'del')!.score).toBe(80);
    expect(r.pillars.find((p) => p.pillarId === 'qua')!.score).toBe(90);
    expect(r.weightedTotal).toBe(83);
    expect(r.ratingLabel).toBe('Tốt');
  });

  it('applies a weight profile override instead of base pillar weights', () => {
    const scores = new Map<string, number | null>([['d1', 90], ['d2', 70], ['q1', 80], ['q2', 100]]);
    // Profile flips weights: Delivery 30, Quality 70 → (80*30 + 90*70)/100 = 87 → "Tốt"
    const profile = new Map<string, number>([['del', 30], ['qua', 70]]);
    const r = computeScorecard(pillars, scores, profile, bands);
    expect(r.weightedTotal).toBe(87);
  });

  it('skips KPIs with no entry (partial scoring) and still rates what exists', () => {
    const scores = new Map<string, number | null>([['d1', 90]]); // only one KPI entered
    const r = computeScorecard(pillars, scores, null, bands);
    expect(r.pillars.find((p) => p.pillarId === 'del')!.score).toBe(90); // only d1 counts
    expect(r.pillars.find((p) => p.pillarId === 'qua')!.score).toBeNull(); // no quality entry
    expect(r.weightedTotal).toBe(90); // only delivery pillar contributes
  });
});
