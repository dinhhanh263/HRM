import type { PrismaClient } from '@prisma/client';
import { ApprovalFlowType, ApproverType } from '@prisma/client';
import {
  AGILE_FRAMEWORK_NAME,
  AGILE_PILLARS,
  AGILE_WEIGHT_PROFILES,
  AGILE_RATING_BANDS,
  AGILE_SURVEYS,
} from './agile-framework.data.js';

// SPEC-044: tên flow review KPI mặc định của tenant.
export const DEFAULT_KPI_REVIEW_FLOW_NAME = 'Luồng duyệt review KPI mặc định';

// Luồng duyệt review KPI 2 bước (tái dùng engine ApprovalFlow):
//   Bước 0: MANAGER          → quản lý trực tiếp calibrate
//   Bước 1: ROLE=hr_manager  → HR chốt (finalize)
// stepOrder 0-based theo convention ApprovalStep.
export const DEFAULT_KPI_REVIEW_FLOW_STEPS = [
  { stepOrder: 0, approverType: ApproverType.MANAGER, roleKey: null, approverId: null },
  { stepOrder: 1, approverType: ApproverType.ROLE, roleKey: 'hr_manager', approverId: null },
] as const;

/**
 * Idempotently seed the default tenant-wide KPI_REVIEW approval flow.
 * Guard với findFirst (Postgres coi NULL departmentId là distinct → unique không
 * ép single-default).
 */
export async function seedDefaultKpiReviewFlowForTenant(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  const existing = await prisma.approvalFlow.findFirst({
    where: { tenantId, departmentId: null, flowType: ApprovalFlowType.KPI_REVIEW },
    select: { id: true },
  });
  if (existing) return;

  await prisma.approvalFlow.create({
    data: {
      tenantId,
      departmentId: null,
      flowType: ApprovalFlowType.KPI_REVIEW,
      name: DEFAULT_KPI_REVIEW_FLOW_NAME,
      active: true,
      steps: { create: DEFAULT_KPI_REVIEW_FLOW_STEPS.map((s) => ({ ...s })) },
    },
  });
}

/**
 * Idempotently seed the "Agile Software Team" template framework for a tenant.
 * Guard on framework name (unique [tenantId, name]) — skip if already present,
 * so re-running never duplicates pillars/KPIs.
 */
export async function seedAgileFrameworkForTenant(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  const existing = await prisma.kpiFramework.findFirst({
    where: { tenantId, name: AGILE_FRAMEWORK_NAME },
    select: { id: true },
  });
  if (existing) return;

  await prisma.$transaction(async (tx) => {
    const framework = await tx.kpiFramework.create({
      data: {
        tenantId,
        name: AGILE_FRAMEWORK_NAME,
        description:
          'KPI Agile theo 4 trụ cột: Delivery · Quality · Process · Team Health (template seed).',
        defaultPeriodType: 'MONTHLY',
        ratingBands: { create: AGILE_RATING_BANDS.map((b) => ({ ...b })) },
      },
    });

    // Pillars + KPI definitions. Lưu pillarId theo tên để map weight profile.
    const pillarIdByName = new Map<string, string>();
    for (const p of AGILE_PILLARS) {
      const pillar = await tx.kpiPillar.create({
        data: {
          frameworkId: framework.id,
          name: p.name,
          weight: p.weight,
          order: p.order,
          color: p.color,
          definitions: {
            create: p.definitions.map((d, i) => ({
              code: d.code,
              name: d.name,
              description: d.description,
              dataSource: d.dataSource,
              unit: d.unit,
              direction: d.direction,
              targetValue: d.targetValue,
              minValue: d.minValue,
              weightInPillar: d.weightInPillar,
              scope: d.scope,
              inputType: d.inputType,
              scoringMethod: d.scoringMethod,
              surveyKpiCode: d.surveyKpiCode ?? null,
              frequency: d.frequency,
              order: i,
            })),
          },
        },
      });
      pillarIdByName.set(p.name, pillar.id);
    }

    // Weight profiles — map [Delivery, Quality, Process, Team Health].
    const pillarOrder = AGILE_PILLARS.map((p) => p.name);
    for (const profile of AGILE_WEIGHT_PROFILES) {
      await tx.kpiWeightProfile.create({
        data: {
          frameworkId: framework.id,
          name: profile.name,
          description: profile.description,
          pillarWeights: {
            create: profile.weights.map((weight, idx) => ({
              pillarId: pillarIdByName.get(pillarOrder[idx])!,
              weight,
            })),
          },
        },
      });
    }

    // Survey templates.
    for (const survey of AGILE_SURVEYS) {
      await tx.kpiSurvey.create({
        data: {
          tenantId,
          frameworkId: framework.id,
          type: survey.type,
          title: survey.title,
          isAnonymous: true,
          minResponses: 3,
          questions: { create: survey.questions.map((q) => ({ ...q })) },
        },
      });
    }
  });
}
