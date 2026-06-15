import {
  probationGuidelineRepository,
  type ProbationGuidelineFilters,
} from '../repositories/probation-guideline.repository.js';
import { toProbationGuidelineDto } from '../probation/mappers.js';
import { NotFoundError } from '../../shared/errors/index.js';
import type {
  ProbationGuidelineDto,
  CreateProbationGuidelineInput,
  UpdateProbationGuidelineInput,
} from '@hrm/shared';

export const probationGuidelineService = {
  async getAll(
    tenantId: string,
    filters: ProbationGuidelineFilters = {},
  ): Promise<ProbationGuidelineDto[]> {
    const rows = await probationGuidelineRepository.findAll(tenantId, filters);
    return rows.map(toProbationGuidelineDto);
  },

  async create(
    tenantId: string,
    input: CreateProbationGuidelineInput,
  ): Promise<ProbationGuidelineDto> {
    const created = await probationGuidelineRepository.create({
      tenant: { connect: { id: tenantId } },
      year: input.year,
      language: input.language ?? 'vi',
      title: input.title.trim(),
      content: input.content,
      order: input.order ?? 0,
    });
    return toProbationGuidelineDto(created);
  },

  async update(
    id: string,
    tenantId: string,
    input: UpdateProbationGuidelineInput,
  ): Promise<ProbationGuidelineDto> {
    const existing = await probationGuidelineRepository.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Probation guideline not found');
    }

    const updated = await probationGuidelineRepository.update(id, tenantId, {
      year: input.year,
      language: input.language,
      title: input.title?.trim(),
      content: input.content,
      order: input.order,
    });
    return toProbationGuidelineDto(updated);
  },

  async remove(id: string, tenantId: string): Promise<void> {
    const existing = await probationGuidelineRepository.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Probation guideline not found');
    }
    await probationGuidelineRepository.delete(id, tenantId);
  },
};
