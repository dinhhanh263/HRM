/**
 * Pure scoring engine for KPI (SPEC-044).
 *
 * Quy đổi giá trị thực tế (actual) → điểm 0..100, tổng hợp theo trụ cột và
 * weighted theo role, rồi tra thang rating. Không chạm DB → unit-test đầy đủ.
 *
 * Mô hình THRESHOLD_LINEAR: một đường thẳng đi qua 2 mốc neo
 *   (minValue → passAnchor=60)  và  (targetValue → targetAnchor=90)
 * rồi clamp [0,100]. Chiều tốt (HIGHER/LOWER) được mã hoá tự nhiên qua việc
 * target lớn hay nhỏ hơn min, nên cùng một công thức đúng cho cả hai chiều:
 *   - HIGHER_BETTER: target > min  → slope dương
 *   - LOWER_BETTER:  target < min  → slope âm (giá trị nhỏ ⇒ điểm cao)
 * Dưới min điểm tụt xuống tới 0; vượt target điểm lên tới 100 rồi cap.
 */

export type KpiDirection = 'HIGHER_BETTER' | 'LOWER_BETTER';
export type KpiScoringMethod = 'THRESHOLD_LINEAR' | 'DIRECT' | 'BOOLEAN' | 'BANDED';

export interface ScoringDef {
  direction: KpiDirection;
  scoringMethod: KpiScoringMethod;
  targetValue: number | null;
  minValue: number | null;
}

export interface ScoreAnchors {
  /** Điểm tại mốc "Đạt" (minValue). Mặc định 60. */
  pass: number;
  /** Điểm tại mốc "Tốt" (targetValue). Mặc định 90. */
  target: number;
}

export const DEFAULT_ANCHORS: ScoreAnchors = { pass: 60, target: 90 };

export interface RatingBand {
  label: string;
  minScore: number;
  maxScore: number;
}

const SCORE_MIN = 0;
const SCORE_MAX = 100;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Làm tròn 2 chữ số thập phân, tránh nhiễu dấu phẩy động. */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Quy đổi 1 giá trị thực tế → điểm 0..100 theo định nghĩa KPI. Trả null khi
 * chưa có actual, hoặc THRESHOLD_LINEAR thiếu target/min để neo.
 */
export function scoreEntry(
  actual: number | null,
  def: ScoringDef,
  anchors: ScoreAnchors = DEFAULT_ANCHORS,
): number | null {
  if (actual === null || actual === undefined || Number.isNaN(actual)) return null;

  switch (def.scoringMethod) {
    case 'DIRECT':
    case 'BANDED':
      // Giá trị đã là điểm 0..100 (BANDED: mapping áp dụng phía upstream).
      return round2(clamp(actual, SCORE_MIN, SCORE_MAX));

    case 'BOOLEAN':
      return actual >= 1 ? SCORE_MAX : SCORE_MIN;

    case 'THRESHOLD_LINEAR': {
      const { targetValue: target, minValue: min } = def;
      if (target === null || min === null) return null;

      if (target === min) {
        const meets =
          def.direction === 'HIGHER_BETTER' ? actual >= target : actual <= target;
        return meets ? anchors.target : anchors.pass;
      }

      const slope = (anchors.target - anchors.pass) / (target - min);
      const raw = anchors.pass + (actual - min) * slope;
      return round2(clamp(raw, SCORE_MIN, SCORE_MAX));
    }

    default:
      return null;
  }
}

interface WeightedScore {
  score: number | null;
  weight: number;
}

/** Trung bình có trọng số, bỏ qua mục chưa có điểm (null) và reweight phần còn lại. */
function weightedAverage(items: WeightedScore[]): number | null {
  let sum = 0;
  let totalWeight = 0;
  for (const it of items) {
    if (it.score === null || it.score === undefined) continue;
    if (it.weight <= 0) continue;
    sum += it.score * it.weight;
    totalWeight += it.weight;
  }
  if (totalWeight === 0) return null;
  return round2(sum / totalWeight);
}

/** Điểm 1 trụ cột = trung bình có trọng số (weightInPillar) các KPI trong trụ cột. */
export function computePillarScore(kpiScores: WeightedScore[]): number | null {
  return weightedAverage(kpiScores);
}

/** Điểm tổng = trung bình có trọng số (pillar weight theo profile) các trụ cột. */
export function computeOverall(pillarScores: WeightedScore[]): number | null {
  return weightedAverage(pillarScores);
}

/**
 * Tra nhãn rating cho 1 điểm tổng. Chọn band có minScore lớn nhất mà ≤ score —
 * tránh "khe hở" tại biên (vd 89.5 vẫn rơi đúng band "Tốt" 75-89 thay vì lọt khe).
 */
export function resolveRating(score: number | null, bands: RatingBand[]): string | null {
  if (score === null || score === undefined) return null;
  const sorted = [...bands].sort((a, b) => b.minScore - a.minScore);
  const band = sorted.find((b) => score >= b.minScore);
  return band ? band.label : null;
}

export interface ScorecardPillarInput {
  pillarId: string;
  baseWeight: number; // pillar.weight mặc định của framework
  definitions: { id: string; weightInPillar: number }[];
}

export interface ScorecardResult {
  pillars: { pillarId: string; score: number | null; weight: number }[];
  weightedTotal: number | null;
  ratingLabel: string | null;
}

/**
 * Tính scorecard 1 nhân viên: điểm từng pillar (trung bình có trọng số các KPI đã
 * chấm), điểm tổng weighted theo profile (nếu có) hoặc trọng số pillar mặc định,
 * rồi tra rating. `scoreByDef` đã gộp điểm KPI cá nhân + KPI team của member.
 */
export function computeScorecard(
  pillars: ScorecardPillarInput[],
  scoreByDef: Map<string, number | null>,
  profileWeightByPillar: Map<string, number> | null,
  bands: RatingBand[],
): ScorecardResult {
  const pillarResults = pillars.map((p) => {
    const kpiScores = p.definitions.map((d) => ({
      score: scoreByDef.get(d.id) ?? null,
      weight: d.weightInPillar,
    }));
    const weight = profileWeightByPillar?.get(p.pillarId) ?? p.baseWeight;
    return { pillarId: p.pillarId, score: computePillarScore(kpiScores), weight };
  });

  const weightedTotal = computeOverall(
    pillarResults.map((p) => ({ score: p.score, weight: p.weight })),
  );

  return { pillars: pillarResults, weightedTotal, ratingLabel: resolveRating(weightedTotal, bands) };
}
