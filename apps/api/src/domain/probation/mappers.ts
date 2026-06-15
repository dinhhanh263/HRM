import type {
  ProbationCriteria,
  ProbationReview,
  ProbationGuideline,
  Employee,
  Department,
  Position,
} from '@prisma/client';
import type {
  ProbationCriteriaDto,
  ProbationReviewDto,
  ProbationSelfReviewDto,
  ProbationGuidelineDto,
  ProbationRatings,
  ProbationReviewActorRef,
  ProbationReviewStatus,
  ProbationOutcome,
  ProbationCompetencyGroup,
  ProbationRubricLevel,
  ProbationDeliverable,
} from '@hrm/shared';

export function toProbationCriteriaDto(c: ProbationCriteria): ProbationCriteriaDto {
  return {
    id: c.id,
    tenantId: c.tenantId,
    name: c.name,
    order: c.order,
    isActive: c.isActive,
    group: c.group as ProbationCompetencyGroup,
    rubric: (c.rubric as ProbationRubricLevel[] | null) ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function toProbationGuidelineDto(g: ProbationGuideline): ProbationGuidelineDto {
  return {
    id: g.id,
    tenantId: g.tenantId,
    year: g.year,
    language: g.language as ProbationGuidelineDto['language'],
    title: g.title,
    content: g.content,
    order: g.order,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

// SPEC-033: DTO dành riêng cho nhân viên chủ thể — build từ danh sách trường TƯỜNG MINH,
// không spread từ review, để trường manager/HR mới thêm sau này không bao giờ lọt ra.
export function toProbationSelfReviewDto(
  r: ProbationReview,
  criteria: ProbationCriteria[],
): ProbationSelfReviewDto {
  return {
    id: r.id,
    status: r.status as ProbationReviewStatus,
    probationEndDate: r.probationEndDateAtCreate?.toISOString() ?? null,
    criteria: criteria.map(toProbationCriteriaDto),
    selfRatings: (r.selfRatings as ProbationRatings | null) ?? null,
    selfComment: r.selfComment,
    selfSubmittedAt: r.selfSubmittedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

// Minimal actor projection (reviewer / decider) — enough to render an avatar + name.
type ActorRelation = Pick<Employee, 'id' | 'fullName' | 'avatar'> | null | undefined;

function toActorRef(actor: ActorRelation): ProbationReviewActorRef | null {
  if (!actor) return null;
  return { id: actor.id, fullName: actor.fullName, avatar: actor.avatar };
}

type EmployeeRelation = Employee & {
  department?: Pick<Department, 'name'> | null;
  position?: Pick<Position, 'name'> | null;
};

export type ProbationReviewWithRelations = ProbationReview & {
  employee: EmployeeRelation;
  reviewer?: ActorRelation;
  decidedBy?: ActorRelation;
};

export function toProbationReviewDto(r: ProbationReviewWithRelations): ProbationReviewDto {
  return {
    id: r.id,
    tenantId: r.tenantId,
    employee: {
      id: r.employee.id,
      fullName: r.employee.fullName,
      employeeCode: r.employee.employeeCode,
      avatar: r.employee.avatar,
      departmentName: r.employee.department?.name ?? null,
      positionName: r.employee.position?.name ?? null,
      probationEndDate: r.employee.probationEndDate?.toISOString() ?? null,
    },
    status: r.status as ProbationReviewStatus,
    reviewer: toActorRef(r.reviewer),
    // SPEC-033: nháp self là riêng tư — manager/HR chỉ thấy sau khi NV NỘP.
    selfRatings: r.selfSubmittedAt ? ((r.selfRatings as ProbationRatings | null) ?? null) : null,
    selfComment: r.selfSubmittedAt ? r.selfComment : null,
    selfSubmittedAt: r.selfSubmittedAt?.toISOString() ?? null,
    ratings: (r.ratings as ProbationRatings | null) ?? null,
    deliverables: (r.deliverables as ProbationDeliverable[] | null) ?? null,
    strengths: r.strengths,
    weaknesses: r.weaknesses,
    comment: r.comment,
    recommendation: (r.recommendation as ProbationOutcome | null) ?? null,
    submittedAt: r.submittedAt?.toISOString() ?? null,
    decidedBy: toActorRef(r.decidedBy),
    decision: (r.decision as ProbationOutcome | null) ?? null,
    decisionNote: r.decisionNote,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    newProbationEndDate: r.newProbationEndDate?.toISOString() ?? null,
    probationEndDateAtCreate: r.probationEndDateAtCreate?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
