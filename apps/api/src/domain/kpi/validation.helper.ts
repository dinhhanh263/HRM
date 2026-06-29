/**
 * Pure weight-integrity checks cho KPI framework (SPEC-044, F1).
 *
 * Trọng số phải tổng = 100% ở 3 nơi: (1) các pillar trong framework, (2) các KPI
 * trong mỗi pillar, (3) các pillar trong mỗi weight profile. Cho phép sửa dần
 * (pillar rỗng/chưa đủ KPI được bỏ qua); việc CHẶN dùng framework lệch trọng số
 * thực thi khi tạo cycle (F2). Tách pure để unit-test.
 */
import type { KpiFrameworkValidationIssue } from '@hrm/shared';

const TOLERANCE = 0.01;

export function sumWeights(weights: number[]): number {
  return weights.reduce((s, w) => s + (Number.isFinite(w) ? w : 0), 0);
}

/** true khi tổng đủ 100% (cho phép sai số dấu phẩy động nhỏ). */
export function isComplete100(sum: number): boolean {
  return Math.abs(sum - 100) <= TOLERANCE;
}

export interface FrameworkIntegrityInput {
  pillars: { id: string; name: string; weight: number; kpiWeights: number[] }[];
  profiles: { id: string; name: string; pillarWeights: number[] }[];
}

/**
 * Liệt kê mọi vi phạm trọng số của framework. Framework rỗng (chưa có pillar)
 * → [] (chưa có gì để validate). Pillar chưa có KPI → bỏ qua phần KPI của nó.
 */
export function collectFrameworkWeightIssues(
  input: FrameworkIntegrityInput,
): KpiFrameworkValidationIssue[] {
  const issues: KpiFrameworkValidationIssue[] = [];

  if (input.pillars.length > 0) {
    const pillarSum = sumWeights(input.pillars.map((p) => p.weight));
    if (!isComplete100(pillarSum)) {
      issues.push({ scope: 'PILLARS', refId: null, label: 'Tổng trọng số trụ cột', actualSum: round2(pillarSum) });
    }

    for (const p of input.pillars) {
      if (p.kpiWeights.length === 0) continue; // pillar chưa có KPI
      const kpiSum = sumWeights(p.kpiWeights);
      if (!isComplete100(kpiSum)) {
        issues.push({ scope: 'PILLAR_KPIS', refId: p.id, label: p.name, actualSum: round2(kpiSum) });
      }
    }
  }

  for (const prof of input.profiles) {
    const profSum = sumWeights(prof.pillarWeights);
    if (!isComplete100(profSum)) {
      issues.push({ scope: 'PROFILE', refId: prof.id, label: prof.name, actualSum: round2(profSum) });
    }
  }

  return issues;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
