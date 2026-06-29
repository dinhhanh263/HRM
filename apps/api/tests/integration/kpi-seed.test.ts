import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/infrastructure/database/client.js';
import {
  seedAgileFrameworkForTenant,
  seedDefaultKpiReviewFlowForTenant,
  DEFAULT_KPI_REVIEW_FLOW_NAME,
} from '../../src/domain/kpi/defaults.js';
import { AGILE_FRAMEWORK_NAME } from '../../src/domain/kpi/agile-framework.data.js';

const SLUG = 'kpi-seed-test';
let tenantId: string;

beforeAll(async () => {
  await db.tenant.deleteMany({ where: { slug: SLUG } });
  const tenant = await db.tenant.create({ data: { name: 'KPI Seed Test', slug: SLUG } });
  tenantId = tenant.id;
});

afterAll(async () => {
  await db.tenant.deleteMany({ where: { slug: SLUG } });
});

describe('seedAgileFrameworkForTenant', () => {
  it('seeds the Agile framework matching the Excel template', async () => {
    await seedAgileFrameworkForTenant(db, tenantId);

    const framework = await db.kpiFramework.findFirstOrThrow({
      where: { tenantId, name: AGILE_FRAMEWORK_NAME },
      include: {
        pillars: { include: { definitions: true } },
        weightProfiles: { include: { pillarWeights: true } },
        ratingBands: true,
        surveys: { include: { questions: true } },
      },
    });

    // 4 trụ cột, tổng trọng số = 100%
    expect(framework.pillars).toHaveLength(4);
    const pillarWeightSum = framework.pillars.reduce((s, p) => s + Number(p.weight), 0);
    expect(pillarWeightSum).toBe(100);

    // 16 KPI (4 mỗi trụ cột); mỗi trụ cột Σ weightInPillar = 100%
    const allKpi = framework.pillars.flatMap((p) => p.definitions);
    expect(allKpi).toHaveLength(16);
    for (const p of framework.pillars) {
      expect(p.definitions).toHaveLength(4);
      const wSum = p.definitions.reduce((s, d) => s + Number(d.weightInPillar), 0);
      expect(wSum).toBe(100);
    }

    // Defect Density là LOWER_BETTER với target < min
    const q1 = allKpi.find((d) => d.code === 'Q1')!;
    expect(q1.direction).toBe('LOWER_BETTER');
    expect(Number(q1.targetValue)).toBeLessThan(Number(q1.minValue));

    // 6 weight profile, mỗi profile Σ trọng số pillar = 100%
    expect(framework.weightProfiles).toHaveLength(6);
    for (const prof of framework.weightProfiles) {
      const wSum = prof.pillarWeights.reduce((s, w) => s + Number(w.weight), 0);
      expect(wSum).toBe(100);
    }

    // 5 rating band; 2 survey (3 + 5 câu)
    expect(framework.ratingBands).toHaveLength(5);
    expect(framework.surveys).toHaveLength(2);
    const morale = framework.surveys.find((s) => s.type === 'MONTHLY_MORALE')!;
    const peer = framework.surveys.find((s) => s.type === 'QUARTERLY_PEER_360')!;
    expect(morale.questions).toHaveLength(3);
    expect(peer.questions).toHaveLength(5);
  });

  it('is idempotent — re-running does not duplicate', async () => {
    await seedAgileFrameworkForTenant(db, tenantId);
    await seedAgileFrameworkForTenant(db, tenantId);

    const frameworks = await db.kpiFramework.findMany({
      where: { tenantId, name: AGILE_FRAMEWORK_NAME },
    });
    expect(frameworks).toHaveLength(1);

    const pillarCount = await db.kpiPillar.count({
      where: { framework: { tenantId, name: AGILE_FRAMEWORK_NAME } },
    });
    expect(pillarCount).toBe(4);
  });
});

describe('seedDefaultKpiReviewFlowForTenant', () => {
  it('seeds a 2-step KPI_REVIEW flow idempotently', async () => {
    await seedDefaultKpiReviewFlowForTenant(db, tenantId);
    await seedDefaultKpiReviewFlowForTenant(db, tenantId);

    const flows = await db.approvalFlow.findMany({
      where: { tenantId, flowType: 'KPI_REVIEW' },
      include: { steps: true },
    });
    expect(flows).toHaveLength(1);
    expect(flows[0].name).toBe(DEFAULT_KPI_REVIEW_FLOW_NAME);
    expect(flows[0].steps).toHaveLength(2);
  });
});
