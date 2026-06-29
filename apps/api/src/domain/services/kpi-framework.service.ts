import type {
  KpiFrameworkDto,
  KpiFrameworkListItemDto,
  KpiFrameworkValidationDto,
  UpsertKpiFrameworkInput,
  UpsertKpiPillarInput,
  UpsertKpiDefinitionInput,
  UpsertKpiWeightProfileInput,
  UpsertKpiRatingBandInput,
} from '@hrm/shared';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import { kpiFrameworkRepository } from '../repositories/kpi-framework.repository.js';
import { toFrameworkDto, toFrameworkListItem } from '../kpi/mappers.js';
import { collectFrameworkWeightIssues } from '../kpi/validation.helper.js';

async function loadFrameworkOrThrow(id: string, tenantId: string) {
  const fw = await kpiFrameworkRepository.findById(id, tenantId);
  if (!fw) throw new NotFoundError('KPI framework not found');
  return fw;
}

/** Đảm bảo pillar thuộc framework + tenant. */
async function assertPillarInTenant(pillarId: string, tenantId: string) {
  const p = await kpiFrameworkRepository.findPillarInTenant(pillarId, tenantId);
  if (!p) throw new NotFoundError('Pillar not found');
  return p;
}

export const kpiFrameworkService = {
  async getAll(tenantId: string): Promise<KpiFrameworkListItemDto[]> {
    const rows = await kpiFrameworkRepository.findAll(tenantId);
    return rows.map(toFrameworkListItem);
  },

  async getById(id: string, tenantId: string): Promise<KpiFrameworkDto> {
    return toFrameworkDto(await loadFrameworkOrThrow(id, tenantId));
  },

  async create(tenantId: string, input: UpsertKpiFrameworkInput): Promise<KpiFrameworkDto> {
    const name = input.name.trim();
    if (await kpiFrameworkRepository.findByName(name, tenantId)) {
      throw new ConflictError('Tên framework đã tồn tại');
    }
    const { id } = await kpiFrameworkRepository.create({
      tenantId,
      name,
      description: input.description ?? null,
      defaultPeriodType: input.defaultPeriodType ?? 'MONTHLY',
      passAnchor: input.passAnchor ?? 60,
      targetAnchor: input.targetAnchor ?? 90,
      isActive: input.isActive ?? true,
    });
    return this.getById(id, tenantId);
  },

  async update(id: string, tenantId: string, input: UpsertKpiFrameworkInput): Promise<KpiFrameworkDto> {
    const fw = await loadFrameworkOrThrow(id, tenantId);
    if (input.name && input.name.trim() !== fw.name) {
      if (await kpiFrameworkRepository.findByName(input.name.trim(), tenantId)) {
        throw new ConflictError('Tên framework đã tồn tại');
      }
    }
    await kpiFrameworkRepository.update(id, {
      name: input.name?.trim(),
      description: input.description ?? undefined,
      defaultPeriodType: input.defaultPeriodType,
      passAnchor: input.passAnchor,
      targetAnchor: input.targetAnchor,
      isActive: input.isActive,
    });
    return this.getById(id, tenantId);
  },

  async remove(id: string, tenantId: string): Promise<void> {
    await loadFrameworkOrThrow(id, tenantId);
    const cycleCount = await kpiFrameworkRepository.countCycles(id);
    if (cycleCount > 0) {
      throw new ConflictError(`Không thể xóa framework đang có ${cycleCount} chu kỳ`);
    }
    await kpiFrameworkRepository.delete(id);
  },

  /** Kiểm tra tính toàn vẹn trọng số (Σ=100%) — dùng cho cảnh báo UI + chặn tạo cycle (F2). */
  async validate(id: string, tenantId: string): Promise<KpiFrameworkValidationDto> {
    const fw = await loadFrameworkOrThrow(id, tenantId);
    const issues = collectFrameworkWeightIssues({
      pillars: fw.pillars.map((p) => ({
        id: p.id,
        name: p.name,
        weight: Number(p.weight),
        kpiWeights: p.definitions.map((d) => Number(d.weightInPillar)),
      })),
      profiles: fw.weightProfiles.map((pr) => ({
        id: pr.id,
        name: pr.name,
        pillarWeights: pr.pillarWeights.map((w) => Number(w.weight)),
      })),
    });
    return { valid: issues.length === 0, issues };
  },

  // ── Pillars ────────────────────────────────────────────────────────────
  async addPillar(frameworkId: string, tenantId: string, input: UpsertKpiPillarInput): Promise<KpiFrameworkDto> {
    await loadFrameworkOrThrow(frameworkId, tenantId);
    await kpiFrameworkRepository.createPillar(frameworkId, {
      name: input.name.trim(),
      weight: input.weight,
      order: input.order ?? 0,
      color: input.color ?? null,
    });
    return this.getById(frameworkId, tenantId);
  },

  async updatePillar(frameworkId: string, pillarId: string, tenantId: string, input: UpsertKpiPillarInput): Promise<KpiFrameworkDto> {
    await assertPillarInTenant(pillarId, tenantId);
    await kpiFrameworkRepository.updatePillar(pillarId, {
      name: input.name?.trim(),
      weight: input.weight,
      order: input.order,
      color: input.color ?? undefined,
    });
    return this.getById(frameworkId, tenantId);
  },

  async removePillar(frameworkId: string, pillarId: string, tenantId: string): Promise<KpiFrameworkDto> {
    await assertPillarInTenant(pillarId, tenantId);
    await kpiFrameworkRepository.deletePillar(pillarId);
    return this.getById(frameworkId, tenantId);
  },

  // ── Definitions ──────────────────────────────────────────────────────────
  async addDefinition(frameworkId: string, pillarId: string, tenantId: string, input: UpsertKpiDefinitionInput): Promise<KpiFrameworkDto> {
    await assertPillarInTenant(pillarId, tenantId);
    await kpiFrameworkRepository.createDefinition(pillarId, mapDefinitionInput(input));
    return this.getById(frameworkId, tenantId);
  },

  async updateDefinition(frameworkId: string, defId: string, tenantId: string, input: UpsertKpiDefinitionInput): Promise<KpiFrameworkDto> {
    const def = await kpiFrameworkRepository.findDefinitionInTenant(defId, tenantId);
    if (!def) throw new NotFoundError('KPI definition not found');
    await kpiFrameworkRepository.updateDefinition(defId, mapDefinitionInput(input));
    return this.getById(frameworkId, tenantId);
  },

  async removeDefinition(frameworkId: string, defId: string, tenantId: string): Promise<KpiFrameworkDto> {
    const def = await kpiFrameworkRepository.findDefinitionInTenant(defId, tenantId);
    if (!def) throw new NotFoundError('KPI definition not found');
    await kpiFrameworkRepository.deleteDefinition(defId);
    return this.getById(frameworkId, tenantId);
  },

  // ── Weight profiles ──────────────────────────────────────────────────────
  async addProfile(frameworkId: string, tenantId: string, input: UpsertKpiWeightProfileInput): Promise<KpiFrameworkDto> {
    const fw = await loadFrameworkOrThrow(frameworkId, tenantId);
    assertProfilePillars(fw.pillars.map((p) => p.id), input);
    await kpiFrameworkRepository.createProfile(frameworkId, {
      name: input.name.trim(),
      description: input.description ?? null,
      pillarWeights: input.pillarWeights.map((w) => ({ pillarId: w.pillarId, weight: w.weight })),
    });
    return this.getById(frameworkId, tenantId);
  },

  async updateProfile(frameworkId: string, profileId: string, tenantId: string, input: UpsertKpiWeightProfileInput): Promise<KpiFrameworkDto> {
    const prof = await kpiFrameworkRepository.findProfileInTenant(profileId, tenantId);
    if (!prof) throw new NotFoundError('Weight profile not found');
    const fw = await loadFrameworkOrThrow(frameworkId, tenantId);
    assertProfilePillars(fw.pillars.map((p) => p.id), input);
    await kpiFrameworkRepository.updateProfile(profileId, {
      name: input.name?.trim(),
      description: input.description ?? null,
      pillarWeights: input.pillarWeights?.map((w) => ({ pillarId: w.pillarId, weight: w.weight })),
    });
    return this.getById(frameworkId, tenantId);
  },

  async removeProfile(frameworkId: string, profileId: string, tenantId: string): Promise<KpiFrameworkDto> {
    const prof = await kpiFrameworkRepository.findProfileInTenant(profileId, tenantId);
    if (!prof) throw new NotFoundError('Weight profile not found');
    await kpiFrameworkRepository.deleteProfile(profileId);
    return this.getById(frameworkId, tenantId);
  },

  // ── Rating bands ─────────────────────────────────────────────────────────
  async addBand(frameworkId: string, tenantId: string, input: UpsertKpiRatingBandInput): Promise<KpiFrameworkDto> {
    const fw = await loadFrameworkOrThrow(frameworkId, tenantId);
    assertNoBandOverlap(fw.ratingBands, input, null);
    await kpiFrameworkRepository.createBand(frameworkId, mapBandInput(input));
    return this.getById(frameworkId, tenantId);
  },

  async updateBand(frameworkId: string, bandId: string, tenantId: string, input: UpsertKpiRatingBandInput): Promise<KpiFrameworkDto> {
    const band = await kpiFrameworkRepository.findBandInTenant(bandId, tenantId);
    if (!band) throw new NotFoundError('Rating band not found');
    const fw = await loadFrameworkOrThrow(frameworkId, tenantId);
    assertNoBandOverlap(fw.ratingBands, input, bandId);
    await kpiFrameworkRepository.updateBand(bandId, mapBandInput(input));
    return this.getById(frameworkId, tenantId);
  },

  async removeBand(frameworkId: string, bandId: string, tenantId: string): Promise<KpiFrameworkDto> {
    const band = await kpiFrameworkRepository.findBandInTenant(bandId, tenantId);
    if (!band) throw new NotFoundError('Rating band not found');
    await kpiFrameworkRepository.deleteBand(bandId);
    return this.getById(frameworkId, tenantId);
  },

  // ── Department assignment ──────────────────────────────────────────────────
  async setDepartments(frameworkId: string, tenantId: string, departmentIds: string[]): Promise<KpiFrameworkDto> {
    await loadFrameworkOrThrow(frameworkId, tenantId);
    await kpiFrameworkRepository.setDepartments(frameworkId, tenantId, departmentIds);
    return this.getById(frameworkId, tenantId);
  },
};

function mapDefinitionInput(input: UpsertKpiDefinitionInput) {
  return {
    code: input.code.trim(),
    name: input.name.trim(),
    description: input.description ?? null,
    dataSource: input.dataSource ?? null,
    unit: input.unit ?? null,
    direction: input.direction,
    targetValue: input.targetValue ?? null,
    minValue: input.minValue ?? null,
    weightInPillar: input.weightInPillar,
    scope: input.scope,
    inputType: input.inputType,
    scoringMethod: input.scoringMethod,
    surveyKpiCode: input.surveyKpiCode ?? null,
    frequency: input.frequency ?? null,
    order: input.order ?? 0,
  };
}

/** M1: mọi pillarId trong profile phải thuộc framework (chống bind chéo framework/tenant). */
function assertProfilePillars(frameworkPillarIds: string[], input: UpsertKpiWeightProfileInput) {
  const allowed = new Set(frameworkPillarIds);
  for (const w of input.pillarWeights) {
    if (!allowed.has(w.pillarId)) {
      throw new ConflictError('Hồ sơ trọng số tham chiếu trụ cột không thuộc framework');
    }
  }
}

/** M2: khoảng điểm của band không được chồng lấn band khác (AC Task 1.3). */
function assertNoBandOverlap(
  existing: { id: string; minScore: unknown; maxScore: unknown }[],
  input: UpsertKpiRatingBandInput,
  excludeId: string | null,
) {
  for (const b of existing) {
    if (b.id === excludeId) continue;
    const min = Number(b.minScore);
    const max = Number(b.maxScore);
    if (input.minScore <= max && min <= input.maxScore) {
      throw new ConflictError('Khoảng điểm chồng lấn với một mức đánh giá khác');
    }
  }
}

function mapBandInput(input: UpsertKpiRatingBandInput) {
  return {
    label: input.label.trim(),
    minScore: input.minScore,
    maxScore: input.maxScore,
    color: input.color ?? null,
    recommendedAction: input.recommendedAction ?? null,
    order: input.order ?? 0,
  };
}
