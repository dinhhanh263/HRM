import type { PrismaClient, StageType } from '@prisma/client';

/**
 * Default hiring pipelines seeded per tenant. A Job clones one of these (or a
 * custom template) into its own JobStage rows at creation, so later edits to a
 * Job's pipeline never affect other Jobs. Every pipeline must end with the
 * terminal HIRED and REJECTED stages.
 */
export const DEFAULT_PIPELINE_TEMPLATES: {
  name: string;
  isDefault: boolean;
  stages: { name: string; order: number; type: StageType }[];
}[] = [
  {
    name: 'Quy trình chuẩn',
    isDefault: true,
    stages: [
      { name: 'Ứng viên mới', order: 0, type: 'SOURCED' },
      { name: 'Sàng lọc CV', order: 1, type: 'SCREEN' },
      { name: 'Phỏng vấn', order: 2, type: 'INTERVIEW' },
      { name: 'Đề nghị (Offer)', order: 3, type: 'OFFER' },
      { name: 'Đã tuyển', order: 4, type: 'HIRED' },
      { name: 'Từ chối', order: 5, type: 'REJECTED' },
    ],
  },
  {
    name: 'Có bài test kỹ thuật',
    isDefault: false,
    stages: [
      { name: 'Ứng viên mới', order: 0, type: 'SOURCED' },
      { name: 'Sàng lọc CV', order: 1, type: 'SCREEN' },
      { name: 'Bài test kỹ thuật', order: 2, type: 'ASSESSMENT' },
      { name: 'Phỏng vấn', order: 3, type: 'INTERVIEW' },
      { name: 'Đề nghị (Offer)', order: 4, type: 'OFFER' },
      { name: 'Đã tuyển', order: 5, type: 'HIRED' },
      { name: 'Từ chối', order: 6, type: 'REJECTED' },
    ],
  },
];

/** Idempotently seed the default pipeline templates for a tenant. */
export async function seedPipelineTemplatesForTenant(
  prisma: PrismaClient,
  tenantId: string
): Promise<void> {
  for (const def of DEFAULT_PIPELINE_TEMPLATES) {
    const existing = await prisma.pipelineTemplate.findFirst({
      where: { tenantId, name: def.name },
    });
    if (existing) continue;
    await prisma.pipelineTemplate.create({
      data: {
        tenantId,
        name: def.name,
        isDefault: def.isDefault,
        stages: { create: def.stages },
      },
    });
  }
}
