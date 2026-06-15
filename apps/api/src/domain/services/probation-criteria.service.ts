import { Prisma } from '@prisma/client';
import {
  probationCriteriaRepository,
  type ProbationCriteriaFilters,
} from '../repositories/probation-criteria.repository.js';
import { toProbationCriteriaDto } from '../probation/mappers.js';
import { NotFoundError, ConflictError } from '../../shared/errors/index.js';
import type {
  ProbationCriteriaDto,
  CreateProbationCriteriaInput,
  UpdateProbationCriteriaInput,
  ProbationRubricLevel,
} from '@hrm/shared';

// Json nullable của Prisma: undefined = giữ nguyên, DbNull = xóa rubric, mảng = ghi đè.
function toRubricWrite(
  rubric: ProbationRubricLevel[] | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (rubric === undefined) return undefined;
  if (rubric === null) return Prisma.DbNull;
  return rubric as unknown as Prisma.InputJsonValue;
}

export const probationCriteriaService = {
  async getAll(
    tenantId: string,
    filters: ProbationCriteriaFilters = {},
  ): Promise<ProbationCriteriaDto[]> {
    const rows = await probationCriteriaRepository.findAll(tenantId, filters);
    return rows.map(toProbationCriteriaDto);
  },

  async create(
    tenantId: string,
    input: CreateProbationCriteriaInput,
  ): Promise<ProbationCriteriaDto> {
    const created = await probationCriteriaRepository.create({
      tenant: { connect: { id: tenantId } },
      name: input.name.trim(),
      order: input.order ?? 0,
      isActive: input.isActive ?? true,
      group: input.group ?? 'PERFORMANCE',
      rubric: toRubricWrite(input.rubric),
    });
    return toProbationCriteriaDto(created);
  },

  async update(
    id: string,
    tenantId: string,
    input: UpdateProbationCriteriaInput,
  ): Promise<ProbationCriteriaDto> {
    const existing = await probationCriteriaRepository.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Probation criteria not found');
    }

    const updated = await probationCriteriaRepository.update(id, tenantId, {
      name: input.name?.trim(),
      order: input.order,
      isActive: input.isActive,
      group: input.group,
      rubric: toRubricWrite(input.rubric),
    });
    return toProbationCriteriaDto(updated);
  },

  async remove(id: string, tenantId: string): Promise<void> {
    const existing = await probationCriteriaRepository.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Probation criteria not found');
    }

    const usageCount = await probationCriteriaRepository.countReviewsUsing(id, tenantId);
    if (usageCount > 0) {
      throw new ConflictError(
        'Cannot delete a criteria that has been used in a review. Deactivate it instead.',
        'PROBATION_CRITERIA_IN_USE',
      );
    }

    await probationCriteriaRepository.delete(id, tenantId);
  },
};
