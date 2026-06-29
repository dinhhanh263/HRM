import type { Prisma } from '@prisma/client';
import type {
  KpiCycleDto, KpiCycleDetailDto, KpiScorecardDto, KpiEntryDto, KpiCycleTeamDto,
  CreateKpiCycleInput, KpiCycleStatus, UpsertKpiEntryInput, KpiEmployeeHistoryDto,
} from '@hrm/shared';
import { KPI_CYCLE_TRANSITIONS } from '@hrm/shared';
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from '../../shared/errors/AppError.js';
import { kpiCycleRepository } from '../repositories/kpi-cycle.repository.js';
import { kpiFrameworkRepository } from '../repositories/kpi-framework.repository.js';
import { employeeRepository } from '../repositories/employee.repository.js';
import { approvalFlowRepository } from '../repositories/approval-flow.repository.js';
import { kpiSurveyRepository } from '../repositories/kpi-survey.repository.js';
import { permissionService } from './permission.service.js';
import { ApprovalFlowType } from '@prisma/client';
import {
  resolveFlow, buildApprovalSnapshot, findNextActiveStep, matchesApprover,
  type FlowCandidate, type SnapshotStep, type ApprovalActor,
} from '../leave/approval-routing.helper.js';
import { db } from '../../infrastructure/database/client.js';
import { kpiFrameworkService } from './kpi-framework.service.js';
import { toFrameworkDto } from '../kpi/mappers.js';
import { scoreEntry, computeScorecard, type ScoringDef, type RatingBand, type ScorecardPillarInput } from '../kpi/scoring.helper.js';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2]|Q[1-4])$/; // YYYY-MM hoặc YYYY-Qn

type FrameworkFull = NonNullable<Awaited<ReturnType<typeof kpiFrameworkRepository.findById>>>;

async function loadCycle(id: string, tenantId: string) {
  const cycle = await kpiCycleRepository.findById(id, tenantId);
  if (!cycle) throw new NotFoundError('KPI cycle not found');
  return cycle;
}

async function loadFramework(frameworkId: string, tenantId: string): Promise<FrameworkFull> {
  const fw = await kpiFrameworkRepository.findById(frameworkId, tenantId);
  if (!fw) throw new NotFoundError('KPI framework not found');
  return fw;
}

function scoringDef(d: FrameworkFull['pillars'][number]['definitions'][number]): ScoringDef {
  return {
    direction: d.direction,
    scoringMethod: d.scoringMethod,
    targetValue: d.targetValue === null ? null : Number(d.targetValue),
    minValue: d.minValue === null ? null : Number(d.minValue),
  };
}

function buildContext(fw: FrameworkFull) {
  const anchors = { pass: Number(fw.passAnchor), target: Number(fw.targetAnchor) };
  const bands: RatingBand[] = fw.ratingBands.map((b) => ({
    label: b.label, minScore: Number(b.minScore), maxScore: Number(b.maxScore),
  }));
  const defMap = new Map<string, { scope: 'INDIVIDUAL' | 'TEAM'; def: ScoringDef }>();
  for (const p of fw.pillars) for (const d of p.definitions) defMap.set(d.id, { scope: d.scope, def: scoringDef(d) });
  const pillarsInput: ScorecardPillarInput[] = fw.pillars.map((p) => ({
    pillarId: p.id, baseWeight: Number(p.weight),
    definitions: p.definitions.map((d) => ({ id: d.id, weightInPillar: Number(d.weightInPillar) })),
  }));
  const profileMap = new Map<string, Map<string, number>>();
  for (const pr of fw.weightProfiles) {
    profileMap.set(pr.id, new Map(pr.pillarWeights.map((w) => [w.pillarId, Number(w.weight)])));
  }
  return { anchors, bands, defMap, pillarsInput, profileMap };
}

/**
 * Tính lại TOÀN BỘ scorecard của cycle từ entries hiện có, trong 1 transaction.
 * Đơn giản (O(scorecards × defs) mỗi lần upsert) — đủ cho quy mô 1 phòng ban;
 * có thể tối ưu chỉ tính scorecard bị ảnh hưởng nếu scale lớn (xem plan F2 note M3).
 */
async function recomputeCycle(cycleId: string, fw: FrameworkFull, client: Prisma.TransactionClient) {
  const ctx = buildContext(fw);
  const entries = await kpiCycleRepository.entriesByCycle(cycleId, client);
  const indiv = new Map<string, number | null>(); // `${scorecardId}:${defId}`
  const team = new Map<string, number | null>(); // `${teamId}:${defId}`
  for (const e of entries) {
    const score = e.computedScore === null ? null : Number(e.computedScore);
    if (e.scorecardId) indiv.set(`${e.scorecardId}:${e.kpiDefinitionId}`, score);
    else if (e.teamId) team.set(`${e.teamId}:${e.kpiDefinitionId}`, score);
  }
  const scorecards = await kpiCycleRepository.scorecardsByCycle(cycleId, client);
  for (const sc of scorecards) {
    const scoreByDef = new Map<string, number | null>();
    for (const [defId, meta] of ctx.defMap) {
      const val = meta.scope === 'TEAM'
        ? (sc.employee.teamId ? team.get(`${sc.employee.teamId}:${defId}`) ?? null : null)
        : indiv.get(`${sc.id}:${defId}`) ?? null;
      scoreByDef.set(defId, val);
    }
    const profileWeights = sc.weightProfileId ? ctx.profileMap.get(sc.weightProfileId) ?? null : null;
    const result = computeScorecard(ctx.pillarsInput, scoreByDef, profileWeights, ctx.bands);
    await kpiCycleRepository.saveScorecardComputation(sc.id, result.weightedTotal, result.ratingLabel, result.pillars, client);
  }
}

function toCycleDto(c: Awaited<ReturnType<typeof kpiCycleRepository.findAll>>[number]): KpiCycleDto {
  return {
    id: c.id, frameworkId: c.frameworkId, frameworkName: c.framework.name,
    period: c.period, periodType: c.periodType, status: c.status,
    scorecardCount: c._count.scorecards,
    createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
  };
}

function toFlowCandidate(flow: {
  id: string; departmentId: string | null; active: boolean;
  steps: { stepOrder: number; approverType: FlowCandidate['steps'][number]['approverType']; roleKey: string | null; approverId: string | null }[];
}): FlowCandidate {
  return { id: flow.id, departmentId: flow.departmentId, active: flow.active, steps: flow.steps };
}

/** Dựng snapshot chuỗi duyệt KPI_REVIEW cho 1 nhân viên (Manager → HR), auto-skip qua helper.
 *  `flows` có thể truyền sẵn để tránh query lặp khi build cho nhiều scorecard (N+1). */
async function resolveReviewSnapshot(
  tenantId: string,
  employeeId: string,
  flows?: Awaited<ReturnType<typeof approvalFlowRepository.findAll>>,
) {
  const routingCtx = await employeeRepository.findRoutingContext(employeeId, tenantId);
  const flowRows = flows ?? (await approvalFlowRepository.findAll(tenantId, ApprovalFlowType.KPI_REVIEW));
  const flow = resolveFlow(flowRows.map(toFlowCandidate), routingCtx?.departmentId ?? null);
  if (!flow) return null;
  const snapshot = buildApprovalSnapshot(flow, {
    requesterId: employeeId,
    directManagerId: routingCtx?.managerId ?? null,
    departmentHeadId: routingCtx?.departmentHeadId ?? null,
  });
  return { flowId: flow.id, snapshot };
}

function snapshotToApprovalRows(snapshot: SnapshotStep[], round: number, now: Date) {
  return snapshot.map((s) => ({
    round, stepOrder: s.stepOrder, approverType: s.approverType, roleKey: s.roleKey, approverId: s.approverId,
    decision: s.skip ? ('AUTO_SKIPPED' as const) : null,
    decidedAt: s.skip ? now : null,
    note: s.skip ? s.skipReason : null,
  }));
}

const currentRound = (approvals: { round: number }[]) => approvals.reduce((m, a) => Math.max(m, a.round), 1);

export const kpiCycleService = {
  async list(tenantId: string): Promise<KpiCycleDto[]> {
    return (await kpiCycleRepository.findAll(tenantId)).map(toCycleDto);
  },

  async create(tenantId: string, input: CreateKpiCycleInput, actorEmployeeId: string | null): Promise<KpiCycleDetailDto> {
    if (!PERIOD_RE.test(input.period)) throw new ValidationError('Kỳ không hợp lệ (YYYY-MM hoặc YYYY-Qn)');
    // Chặn tạo cycle khi framework chưa cân đối trọng số (carry-forward F1→F2).
    const validation = await kpiFrameworkService.validate(input.frameworkId, tenantId);
    if (!validation.valid) throw new ConflictError('Framework chưa cân đối trọng số (Σ phải = 100%)');

    const existing = await db.kpiCycle.findFirst({
      where: { tenantId, frameworkId: input.frameworkId, period: input.period }, select: { id: true },
    });
    if (existing) throw new ConflictError('Đã có chu kỳ cho framework + kỳ này');

    const cycle = await kpiCycleRepository.create({
      tenantId, frameworkId: input.frameworkId, period: input.period,
      periodType: input.periodType, status: 'DRAFT', createdById: actorEmployeeId,
    });
    const employees = await kpiCycleRepository.employeesInScope(tenantId, input.frameworkId);
    await kpiCycleRepository.generateScorecards(tenantId, cycle.id, employees.map((e) => e.id));
    return this.getDetail(cycle.id, tenantId);
  },

  async getDetail(id: string, tenantId: string): Promise<KpiCycleDetailDto> {
    const cycle = await loadCycle(id, tenantId);
    const fw = await loadFramework(cycle.frameworkId, tenantId);
    const pillarNameById = new Map(fw.pillars.map((p) => [p.id, p.name]));
    const scorecards = await kpiCycleRepository.scorecardsByCycle(id);
    const entries = await kpiCycleRepository.entriesByCycle(id);

    const entryDto = (e: (typeof entries)[number]): KpiEntryDto => ({
      id: e.id, kpiDefinitionId: e.kpiDefinitionId, scorecardId: e.scorecardId, teamId: e.teamId,
      actualValue: e.actualValue === null ? null : Number(e.actualValue),
      computedScore: e.computedScore === null ? null : Number(e.computedScore),
      source: e.source, note: e.note,
    });

    const scorecardDtos: KpiScorecardDto[] = scorecards.map((sc) => ({
      id: sc.id, cycleId: sc.cycleId, employeeId: sc.employeeId, employeeName: sc.employee.fullName,
      teamId: sc.employee.teamId, weightProfileId: sc.weightProfileId,
      weightProfileName: sc.weightProfileName ?? null,
      weightedTotal: sc.weightedTotal === null ? null : Number(sc.weightedTotal),
      ratingLabel: sc.ratingLabel, status: sc.status, currentStep: sc.currentStep,
      selfComment: sc.selfComment, selfSubmittedAt: sc.selfSubmittedAt?.toISOString() ?? null,
      strengths: sc.strengths, areasToImprove: sc.areasToImprove,
      actionPlan: sc.actionPlan, recognition: sc.recognition, reviewComment: sc.reviewComment, reviewerId: sc.reviewerId,
      pillars: sc.pillars.map((p) => ({
        pillarId: p.pillarId, pillarName: pillarNameById.get(p.pillarId) ?? '',
        score: p.score === null ? null : Number(p.score), weight: Number(p.weight),
      })),
      entries: entries.filter((e) => e.scorecardId === sc.id).map(entryDto),
      approvals: sc.approvals.map((a) => ({
        round: a.round, stepOrder: a.stepOrder, approverType: a.approverType, roleKey: a.roleKey,
        approverId: a.approverId, decision: a.decision, decidedById: a.decidedById,
        decidedAt: a.decidedAt?.toISOString() ?? null, note: a.note,
      })),
    }));

    // Teams in scope (suy từ thành viên có scorecard).
    const teamMembers = new Map<string, string[]>();
    for (const sc of scorecards) {
      if (sc.employee.teamId) {
        const arr = teamMembers.get(sc.employee.teamId) ?? [];
        arr.push(sc.employeeId);
        teamMembers.set(sc.employee.teamId, arr);
      }
    }
    const teamRows = teamMembers.size > 0
      ? await db.team.findMany({ where: { id: { in: [...teamMembers.keys()] } }, select: { id: true, name: true } })
      : [];
    const teams: KpiCycleTeamDto[] = teamRows.map((tm) => ({
      id: tm.id, name: tm.name, memberIds: teamMembers.get(tm.id) ?? [],
    }));

    return {
      id: cycle.id, frameworkId: cycle.frameworkId, frameworkName: fw.name,
      period: cycle.period, periodType: cycle.periodType, status: cycle.status,
      framework: toFrameworkDto(fw),
      scorecards: scorecardDtos,
      teams,
      teamEntries: entries.filter((e) => e.teamId !== null).map(entryDto),
      createdAt: cycle.createdAt.toISOString(), updatedAt: cycle.updatedAt.toISOString(),
    };
  },

  async transition(id: string, tenantId: string, status: KpiCycleStatus, actorEmployeeId: string | null): Promise<KpiCycleDetailDto> {
    const cycle = await loadCycle(id, tenantId);
    if (!KPI_CYCLE_TRANSITIONS[cycle.status].includes(status)) {
      throw new ConflictError(`Không thể chuyển từ ${cycle.status} sang ${status}`);
    }
    const data: Prisma.KpiCycleUpdateInput = { status };
    if (status === 'PENDING_REVIEW') { data.submittedById = actorEmployeeId; data.submittedAt = new Date(); }
    if (status === 'FINALIZED') {
      data.finalizedById = actorEmployeeId; data.finalizedAt = new Date();
      // Đóng băng cấu hình để scorecard lịch sử bất biến.
      const fw = await loadFramework(cycle.frameworkId, tenantId);
      data.configSnapshot = toFrameworkDto(fw) as unknown as Prisma.InputJsonValue;
    }
    await kpiCycleRepository.updateStatus(id, data);

    // Khi mở duyệt: dựng chuỗi duyệt KPI_REVIEW cho từng scorecard (round 1).
    if (status === 'PENDING_REVIEW') {
      const now = new Date();
      const scorecards = await kpiCycleRepository.scorecardsByCycle(id);
      const flows = await approvalFlowRepository.findAll(tenantId, ApprovalFlowType.KPI_REVIEW); // hoist (tránh N+1)
      for (const sc of scorecards) {
        if (sc.approvals.length > 0) continue; // đã có snapshot
        const routed = await resolveReviewSnapshot(tenantId, sc.employeeId, flows);
        if (!routed) continue; // không có flow → bỏ qua (scorecard giữ trạng thái)
        const rows = snapshotToApprovalRows(routed.snapshot, 1, now);
        const nextStep = findNextActiveStep(routed.snapshot, 1);
        await kpiCycleRepository.persistScorecardSnapshot(
          sc.id, tenantId,
          { flowId: routed.flowId, currentStep: nextStep ?? 0, status: nextStep ? 'IN_REVIEW' : 'FINALIZED' },
          rows,
        );
      }
    }
    return this.getDetail(id, tenantId);
  },

  /** Nhân viên tự đánh giá scorecard của CHÍNH MÌNH khi cycle ở SELF_ASSESSMENT. */
  async selfAssess(scorecardId: string, tenantId: string, actorEmployeeId: string | null, input: { selfComment: string }): Promise<KpiCycleDetailDto> {
    const sc = await kpiCycleRepository.findScorecardForReview(scorecardId, tenantId);
    if (!sc) throw new NotFoundError('Scorecard not found');
    if (sc.cycle.status !== 'SELF_ASSESSMENT') throw new ConflictError('Chu kỳ không ở giai đoạn tự đánh giá');
    if (!actorEmployeeId || sc.employeeId !== actorEmployeeId) throw new ForbiddenError('Chỉ tự đánh giá scorecard của chính mình');
    await kpiCycleRepository.saveSelfAssessment(scorecardId, input.selfComment);
    return this.getDetail(sc.cycle.id, tenantId);
  },

  /**
   * Duyệt/Trả về 1 scorecard ở bước hiện tại (Manager → HR). Reuse approval engine.
   * APPROVED: ghi nhận xét (nếu có) + tiến bước; bước cuối → scorecard FINALIZED.
   * RETURNED: trả về → status SELF_ASSESSED, currentStep=0; manager re-submit vòng mới sau.
   */
  async reviewScorecard(
    scorecardId: string, tenantId: string, actor: ApprovalActor,
    input: import('@hrm/shared').ReviewScorecardInput,
  ): Promise<KpiCycleDetailDto> {
    const sc = await kpiCycleRepository.findScorecardForReview(scorecardId, tenantId);
    if (!sc) throw new NotFoundError('Scorecard not found');
    if (sc.cycle.status !== 'PENDING_REVIEW') throw new ConflictError('Chu kỳ không ở giai đoạn duyệt');
    if (sc.status !== 'IN_REVIEW') throw new ConflictError('Scorecard không ở trạng thái chờ duyệt');

    const round = currentRound(sc.approvals);
    const inRound = sc.approvals.filter((a) => a.round === round);
    const current = inRound.find((a) => a.stepOrder === sc.currentStep && a.decision === null);
    if (!current) throw new ConflictError('Không có bước duyệt đang chờ');
    if (!matchesApprover(current, actor)) throw new ForbiddenError('Bạn không phải người duyệt bước hiện tại');

    const now = new Date();
    // Lưu nhận xét review (calibrate) nếu người duyệt nhập.
    const reviewNotes: Prisma.KpiScorecardUpdateInput = {};
    if (input.strengths !== undefined) reviewNotes.strengths = input.strengths;
    if (input.areasToImprove !== undefined) reviewNotes.areasToImprove = input.areasToImprove;
    if (input.actionPlan !== undefined) reviewNotes.actionPlan = input.actionPlan;
    if (input.recognition !== undefined) reviewNotes.recognition = input.recognition;
    if (input.reviewComment !== undefined) reviewNotes.reviewComment = input.reviewComment;
    if (actor.employeeId) reviewNotes.reviewer = { connect: { id: actor.employeeId } };
    reviewNotes.reviewedAt = now;

    if (input.decision === 'RETURNED') {
      await kpiCycleRepository.recordScorecardDecision(
        current.id,
        { decision: 'RETURNED', decidedById: actor.employeeId, decidedAt: now, note: input.note ?? null },
        scorecardId,
        { ...reviewNotes, status: 'SELF_ASSESSED', currentStep: 0 },
      );
      return this.getDetail(sc.cycle.id, tenantId);
    }

    // APPROVED → tiến tới bước active kế; hết bước → FINALIZED.
    const next = inRound
      .filter((a) => a.stepOrder > sc.currentStep && a.decision === null)
      .sort((a, b) => a.stepOrder - b.stepOrder)[0];
    const scorecardUpdate: Prisma.KpiScorecardUpdateInput = next
      ? { ...reviewNotes, currentStep: next.stepOrder }
      : { ...reviewNotes, status: 'FINALIZED' };
    await kpiCycleRepository.recordScorecardDecision(
      current.id,
      { decision: 'APPROVED', decidedById: actor.employeeId, decidedAt: now, note: input.note ?? null },
      scorecardId,
      scorecardUpdate,
    );
    return this.getDetail(sc.cycle.id, tenantId);
  },

  /** Manager gửi lại scorecard đã RETURNED để duyệt vòng mới (round+1). Chỉ người duyệt
   *  bước đầu của vòng mới (hoặc SUPER_ADMIN) được gửi lại — không phải mọi kpi:review. */
  async resubmitScorecard(scorecardId: string, tenantId: string, actor: ApprovalActor): Promise<KpiCycleDetailDto> {
    const sc = await kpiCycleRepository.findScorecardForReview(scorecardId, tenantId);
    if (!sc) throw new NotFoundError('Scorecard not found');
    if (sc.cycle.status !== 'PENDING_REVIEW') throw new ConflictError('Chu kỳ không ở giai đoạn duyệt');
    if (sc.status !== 'SELF_ASSESSED') throw new ConflictError('Chỉ gửi lại scorecard đã bị trả về');
    const routed = await resolveReviewSnapshot(tenantId, sc.employeeId);
    if (!routed) throw new ConflictError('Không tìm thấy luồng duyệt KPI');
    const nextStep = findNextActiveStep(routed.snapshot, 1);
    // Người gửi lại phải là người duyệt bước active đầu tiên (chống manager khác can thiệp).
    const firstActive = nextStep ? routed.snapshot.find((s) => s.stepOrder === nextStep) : null;
    if (firstActive && !matchesApprover(firstActive, actor)) {
      throw new ForbiddenError('Bạn không phải người duyệt scorecard này');
    }
    const round = currentRound(sc.approvals) + 1;
    const now = new Date();
    const rows = snapshotToApprovalRows(routed.snapshot, round, now);
    await kpiCycleRepository.persistScorecardSnapshot(
      scorecardId, tenantId,
      { flowId: routed.flowId, currentStep: nextStep ?? 0, status: nextStep ? 'IN_REVIEW' : 'FINALIZED' },
      rows,
    );
    return this.getDetail(sc.cycle.id, tenantId);
  },

  async upsertEntries(cycleId: string, tenantId: string, items: UpsertKpiEntryInput[], actorEmployeeId: string | null): Promise<KpiCycleDetailDto> {
    const cycle = await loadCycle(cycleId, tenantId);
    if (cycle.status !== 'DATA_ENTRY') throw new ConflictError('Chu kỳ không ở trạng thái nhập liệu');
    const fw = await loadFramework(cycle.frameworkId, tenantId);
    const ctx = buildContext(fw);

    // Tập hợp lệ trong cycle (chống tampering scorecard/team chéo).
    const scorecards = await kpiCycleRepository.scorecardsByCycle(cycleId);
    const scorecardIds = new Set(scorecards.map((s) => s.id));
    const teamIds = new Set(scorecards.map((s) => s.employee.teamId).filter((t): t is string => !!t));
    const anchors = ctx.anchors;

    // Atomic: upsert toàn bộ entries + recompute trong 1 transaction → không để
    // scorecard ở trạng thái nửa-tính nếu một bước lỗi (H1).
    await db.$transaction(async (tx) => {
      for (const item of items) {
        const meta = ctx.defMap.get(item.kpiDefinitionId);
        if (!meta) throw new NotFoundError('KPI definition not in this framework');
        const computedScore = scoreEntry(item.actualValue, meta.def, anchors);
        if (meta.scope === 'INDIVIDUAL') {
          if (!item.scorecardId || !scorecardIds.has(item.scorecardId)) throw new ValidationError('scorecardId không hợp lệ');
          await kpiCycleRepository.upsertIndividualEntry({
            tenantId, cycleId, scorecardId: item.scorecardId, kpiDefinitionId: item.kpiDefinitionId,
            actualValue: item.actualValue, computedScore, note: item.note ?? null, enteredById: actorEmployeeId,
          }, tx);
        } else {
          if (!item.teamId || !teamIds.has(item.teamId)) throw new ValidationError('teamId không hợp lệ trong cycle');
          await kpiCycleRepository.upsertTeamEntry({
            tenantId, cycleId, teamId: item.teamId, kpiDefinitionId: item.kpiDefinitionId,
            actualValue: item.actualValue, computedScore, note: item.note ?? null, enteredById: actorEmployeeId,
          }, tx);
        }
      }
      await recomputeCycle(cycleId, fw, tx);
    });
    return this.getDetail(cycleId, tenantId);
  },

  /**
   * Lấy lịch sử KPI của 1 nhân viên VỚI kiểm tra scope của người xem:
   * self luôn được · SUPER_ADMIN/kpi:view_all xem mọi người · kpi:view_team xem
   * cấp dưới trực tiếp. Target phải tồn tại trong tenant (chống probe chéo tenant).
   */
  async getEmployeeHistoryForViewer(
    tenantId: string,
    viewer: { userId: string; role: string; roleId: string | null },
    targetEmployeeId: string,
  ): Promise<KpiEmployeeHistoryDto> {
    const target = await employeeRepository.findById(targetEmployeeId, tenantId);
    if (!target) throw new NotFoundError('Employee not found');

    const allowed = await (async () => {
      if (viewer.role === 'SUPER_ADMIN') return true;
      const actor = await employeeRepository.findByUserId(viewer.userId, tenantId);
      if (actor && actor.id === targetEmployeeId) return true; // self
      const perms = viewer.roleId ? await permissionService.getPermissionsForRole(viewer.roleId) : new Set<string>();
      if (perms.has('kpi:view_all')) return true;
      if (perms.has('kpi:view_team') && actor) {
        const reports = await employeeRepository.findReportIds(actor.id, tenantId);
        if (reports.includes(targetEmployeeId)) return true;
      }
      return false;
    })();
    if (!allowed) throw new ForbiddenError('Không có quyền xem KPI của nhân viên này');

    return this.getEmployeeHistory(tenantId, targetEmployeeId);
  },

  /**
   * Tổng hợp survey Team Health vào chu kỳ (chỉ khi DATA_ENTRY). Mỗi survey-KPI
   * (inputType=SURVEY) lấy trung bình đáp án các câu map tới nó → ghi entry TEAM
   * cho mọi team trong cycle. Dưới ngưỡng minResponses → KHÔNG ghi (không lộ điểm).
   */
  async aggregateSurveys(cycleId: string, tenantId: string): Promise<import('@hrm/shared').SurveyAggregateResultDto> {
    const cycle = await loadCycle(cycleId, tenantId);
    if (cycle.status !== 'DATA_ENTRY') throw new ConflictError('Chu kỳ không ở trạng thái nhập liệu');
    const fw = await loadFramework(cycle.frameworkId, tenantId);
    const ctx = buildContext(fw);
    const surveys = await kpiSurveyRepository.findAll(tenantId, fw.id);
    const surveyDefs = fw.pillars.flatMap((p) => p.definitions).filter((d) => d.inputType === 'SURVEY' && d.surveyKpiCode);
    const scorecards = await kpiCycleRepository.scorecardsByCycle(cycleId);
    const teamIds = [...new Set(scorecards.map((s) => s.employee.teamId).filter((t): t is string => !!t))];

    const result: import('@hrm/shared').SurveyAggregateResultDto = { aggregated: [], skipped: [] };

    await db.$transaction(async (tx) => {
      for (const survey of surveys) {
        const responses = await kpiSurveyRepository.responsesForCycle(survey.id, cycleId, tenantId);
        const count = responses.length;
        // Gom điểm theo mã KPI (qua mapsToKpiCode của câu hỏi).
        const byCode = new Map<string, number[]>();
        for (const r of responses) {
          const answers = (r.answers ?? {}) as Record<string, number>;
          for (const q of survey.questions) {
            if (!q.mapsToKpiCode) continue;
            const v = answers[q.code];
            if (typeof v === 'number') {
              const arr = byCode.get(q.mapsToKpiCode) ?? [];
              arr.push(v);
              byCode.set(q.mapsToKpiCode, arr);
            }
          }
        }
        // Ngưỡng & team là điều kiện CẢ SURVEY → kiểm 1 lần trước khi lặp từng KPI code.
        if (byCode.size === 0) continue;
        if (count < survey.minResponses) {
          result.skipped.push({ surveyTitle: survey.title, reason: 'below_min_responses', responseCount: count });
          continue;
        }
        if (teamIds.length === 0) {
          result.skipped.push({ surveyTitle: survey.title, reason: 'no_teams_in_cycle', responseCount: count });
          continue;
        }
        for (const [code, vals] of byCode) {
          const def = surveyDefs.find((d) => d.surveyKpiCode === code);
          if (!def || vals.length === 0) continue;
          const avg = Math.round((vals.reduce((s, n) => s + n, 0) / vals.length) * 1000) / 1000;
          const computedScore = scoreEntry(avg, scoringDef(def), ctx.anchors);
          for (const teamId of teamIds) {
            await kpiCycleRepository.upsertTeamEntry({
              tenantId, cycleId, teamId, kpiDefinitionId: def.id,
              actualValue: avg, computedScore, note: 'survey', enteredById: null,
            }, tx);
          }
          result.aggregated.push({ surveyTitle: survey.title, kpiCode: code, value: avg, responseCount: count, teamsApplied: teamIds.length });
        }
      }
      await recomputeCycle(cycleId, fw, tx);
    });
    return result;
  },

  async getEmployeeHistory(tenantId: string, employeeId: string): Promise<KpiEmployeeHistoryDto> {
    const rows = await kpiCycleRepository.scorecardHistory(tenantId, employeeId);
    return {
      employeeId,
      employeeName: rows[0]?.employee.fullName ?? '',
      points: rows.map((sc) => ({
        scorecardId: sc.id,
        scorecardStatus: sc.status,
        cycleId: sc.cycleId,
        period: sc.cycle.period,
        periodType: sc.cycle.periodType,
        frameworkName: sc.cycle.framework.name,
        status: sc.cycle.status,
        selfComment: sc.selfComment,
        weightedTotal: sc.weightedTotal === null ? null : Number(sc.weightedTotal),
        ratingLabel: sc.ratingLabel,
        pillars: [...sc.pillars]
          .sort((a, b) => a.pillar.order - b.pillar.order)
          .map((p) => ({ pillarName: p.pillar.name, score: p.score === null ? null : Number(p.score) })),
      })),
    };
  },

  async setScorecardProfile(scorecardId: string, tenantId: string, weightProfileId: string | null): Promise<KpiCycleDetailDto> {
    const sc = await kpiCycleRepository.findScorecard(scorecardId, tenantId);
    if (!sc) throw new NotFoundError('Scorecard not found');
    const cycle = await loadCycle(sc.cycleId, tenantId);
    // H2: chỉ đổi profile (→ recompute) khi đang nhập liệu — sau FINALIZED scorecard bất biến.
    if (cycle.status !== 'DATA_ENTRY') throw new ConflictError('Chu kỳ không ở trạng thái nhập liệu');
    const fw = await loadFramework(cycle.frameworkId, tenantId);
    let name: string | null = null;
    if (weightProfileId) {
      const prof = fw.weightProfiles.find((p) => p.id === weightProfileId);
      if (!prof) throw new ValidationError('Weight profile không thuộc framework');
      name = prof.name;
    }
    await db.$transaction(async (tx) => {
      await kpiCycleRepository.setScorecardProfile(scorecardId, weightProfileId, name, tx);
      await recomputeCycle(sc.cycleId, fw, tx);
    });
    return this.getDetail(sc.cycleId, tenantId);
  },
};
