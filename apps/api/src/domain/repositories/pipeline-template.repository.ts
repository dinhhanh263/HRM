import type { Prisma, StageType } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

export interface StageInput {
  name: string;
  order: number;
  type: StageType;
}

const includeStages = {
  stages: { orderBy: { order: 'asc' } },
} satisfies Prisma.PipelineTemplateInclude;

export const pipelineTemplateRepository = {
  async findAll(tenantId: string) {
    return db.pipelineTemplate.findMany({
      where: { tenantId },
      include: includeStages,
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  },

  async findById(id: string, tenantId: string) {
    return db.pipelineTemplate.findFirst({
      where: { id, tenantId },
      include: includeStages,
    });
  },

  async findByName(name: string, tenantId: string) {
    return db.pipelineTemplate.findFirst({ where: { name, tenantId } });
  },

  async create(tenantId: string, data: { name: string; isDefault: boolean; stages: StageInput[] }) {
    return db.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.pipelineTemplate.updateMany({ where: { tenantId }, data: { isDefault: false } });
      }
      return tx.pipelineTemplate.create({
        data: {
          tenantId,
          name: data.name,
          isDefault: data.isDefault,
          stages: { create: data.stages },
        },
        include: includeStages,
      });
    });
  },

  async update(
    id: string,
    tenantId: string,
    data: { name?: string; isDefault?: boolean; stages?: StageInput[] }
  ) {
    return db.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.pipelineTemplate.updateMany({ where: { tenantId }, data: { isDefault: false } });
      }
      if (data.stages) {
        await tx.pipelineTemplateStage.deleteMany({ where: { templateId: id } });
        await tx.pipelineTemplateStage.createMany({
          data: data.stages.map((s) => ({ ...s, templateId: id })),
        });
      }
      return tx.pipelineTemplate.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
        },
        include: includeStages,
      });
    });
  },

  async delete(id: string) {
    return db.pipelineTemplate.delete({ where: { id } });
  },
};
