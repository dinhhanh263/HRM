import type { Prisma } from '@prisma/client';
import type {
  KpiFrameworkDto,
  KpiFrameworkListItemDto,
  KpiPillarDto,
  KpiDefinitionDto,
  KpiWeightProfileDto,
  KpiRatingBandDto,
  TeamDto,
} from '@hrm/shared';

const num = (d: Prisma.Decimal | number): number => Number(d);
const numOrNull = (d: Prisma.Decimal | number | null): number | null =>
  d === null ? null : Number(d);

type DefinitionRow = Prisma.KpiDefinitionGetPayload<{}>;
type PillarRow = Prisma.KpiPillarGetPayload<{ include: { definitions: true } }>;
type ProfileRow = Prisma.KpiWeightProfileGetPayload<{ include: { pillarWeights: true } }>;
type BandRow = Prisma.KpiRatingBandGetPayload<{}>;

export function toDefinitionDto(d: DefinitionRow): KpiDefinitionDto {
  return {
    id: d.id,
    pillarId: d.pillarId,
    code: d.code,
    name: d.name,
    description: d.description,
    dataSource: d.dataSource,
    unit: d.unit,
    direction: d.direction,
    targetValue: numOrNull(d.targetValue),
    minValue: numOrNull(d.minValue),
    weightInPillar: num(d.weightInPillar),
    scope: d.scope,
    inputType: d.inputType,
    scoringMethod: d.scoringMethod,
    surveyKpiCode: d.surveyKpiCode,
    frequency: d.frequency,
    order: d.order,
    isActive: d.isActive,
  };
}

export function toPillarDto(p: PillarRow): KpiPillarDto {
  return {
    id: p.id,
    frameworkId: p.frameworkId,
    name: p.name,
    weight: num(p.weight),
    order: p.order,
    color: p.color,
    definitions: [...p.definitions]
      .sort((a, b) => a.order - b.order)
      .map(toDefinitionDto),
  };
}

export function toProfileDto(p: ProfileRow): KpiWeightProfileDto {
  return {
    id: p.id,
    frameworkId: p.frameworkId,
    name: p.name,
    description: p.description,
    pillarWeights: p.pillarWeights.map((w) => ({ pillarId: w.pillarId, weight: num(w.weight) })),
  };
}

export function toBandDto(b: BandRow): KpiRatingBandDto {
  return {
    id: b.id,
    label: b.label,
    minScore: num(b.minScore),
    maxScore: num(b.maxScore),
    color: b.color,
    recommendedAction: b.recommendedAction,
    order: b.order,
  };
}

type FrameworkFull = Prisma.KpiFrameworkGetPayload<{
  include: {
    pillars: { include: { definitions: true } };
    weightProfiles: { include: { pillarWeights: true } };
    ratingBands: true;
    assignments: true;
  };
}>;

export function toFrameworkDto(f: FrameworkFull): KpiFrameworkDto {
  return {
    id: f.id,
    tenantId: f.tenantId,
    name: f.name,
    description: f.description,
    defaultPeriodType: f.defaultPeriodType,
    passAnchor: num(f.passAnchor),
    targetAnchor: num(f.targetAnchor),
    isActive: f.isActive,
    pillars: [...f.pillars].sort((a, b) => a.order - b.order).map(toPillarDto),
    weightProfiles: f.weightProfiles.map(toProfileDto),
    ratingBands: [...f.ratingBands].sort((a, b) => a.order - b.order).map(toBandDto),
    departmentIds: f.assignments.map((a) => a.departmentId),
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

type FrameworkListRow = Prisma.KpiFrameworkGetPayload<{
  include: { _count: { select: { pillars: true; assignments: true } } };
}> & { kpiCount: number };

export function toFrameworkListItem(f: FrameworkListRow): KpiFrameworkListItemDto {
  return {
    id: f.id,
    name: f.name,
    description: f.description,
    isActive: f.isActive,
    pillarCount: f._count.pillars,
    kpiCount: f.kpiCount,
    departmentCount: f._count.assignments,
    updatedAt: f.updatedAt.toISOString(),
  };
}

type TeamRow = Prisma.TeamGetPayload<{
  include: {
    department: { select: { name: true } };
    lead: { select: { fullName: true } };
    members: { select: { id: true } };
    _count: { select: { members: true } };
  };
}>;

export function toTeamDto(t: TeamRow): TeamDto {
  return {
    id: t.id,
    name: t.name,
    departmentId: t.departmentId,
    departmentName: t.department?.name ?? null,
    leadId: t.leadId,
    leadName: t.lead?.fullName ?? null,
    memberCount: t._count.members,
    memberIds: t.members.map((m) => m.id),
  };
}
