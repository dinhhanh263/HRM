import type { PipelineTemplate, PipelineTemplateStage } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import {
  pipelineTemplateRepository,
  type StageInput,
} from '../repositories/pipeline-template.repository.js';

type TemplateWithStages = PipelineTemplate & { stages: PipelineTemplateStage[] };

function toDto(template: TemplateWithStages) {
  return {
    id: template.id,
    tenantId: template.tenantId,
    name: template.name,
    isDefault: template.isDefault,
    stages: template.stages.map((s) => ({
      id: s.id,
      name: s.name,
      order: s.order,
      type: s.type,
    })),
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

// Stages arrive validated by Zod but with arbitrary order values; normalize to
// a 0..n-1 sequence so the UI and clone logic can rely on contiguous ordering.
function normalizeStages(stages: StageInput[]): StageInput[] {
  return [...stages]
    .sort((a, b) => a.order - b.order)
    .map((s, index) => ({ name: s.name, order: index, type: s.type }));
}

export const pipelineTemplateService = {
  async getAll(tenantId: string) {
    const templates = await pipelineTemplateRepository.findAll(tenantId);
    return templates.map(toDto);
  },

  async getById(id: string, tenantId: string) {
    const template = await pipelineTemplateRepository.findById(id, tenantId);
    if (!template) {
      throw new NotFoundError('Pipeline template not found');
    }
    return toDto(template);
  },

  async create(
    tenantId: string,
    data: { name: string; isDefault?: boolean; stages: StageInput[] }
  ) {
    const existing = await pipelineTemplateRepository.findByName(data.name, tenantId);
    if (existing) {
      throw new ConflictError('Pipeline template name already exists');
    }
    const template = await pipelineTemplateRepository.create(tenantId, {
      name: data.name,
      isDefault: data.isDefault ?? false,
      stages: normalizeStages(data.stages),
    });
    return toDto(template);
  },

  async update(
    id: string,
    tenantId: string,
    data: { name?: string; isDefault?: boolean; stages?: StageInput[] }
  ) {
    const template = await pipelineTemplateRepository.findById(id, tenantId);
    if (!template) {
      throw new NotFoundError('Pipeline template not found');
    }
    if (data.name && data.name !== template.name) {
      const existing = await pipelineTemplateRepository.findByName(data.name, tenantId);
      if (existing) {
        throw new ConflictError('Pipeline template name already exists');
      }
    }
    const updated = await pipelineTemplateRepository.update(id, tenantId, {
      name: data.name,
      isDefault: data.isDefault,
      stages: data.stages ? normalizeStages(data.stages) : undefined,
    });
    return toDto(updated);
  },

  async delete(id: string, tenantId: string) {
    const template = await pipelineTemplateRepository.findById(id, tenantId);
    if (!template) {
      throw new NotFoundError('Pipeline template not found');
    }
    if (template.isDefault) {
      throw new ConflictError('Cannot delete the default pipeline template');
    }
    await pipelineTemplateRepository.delete(id);
  },
};
