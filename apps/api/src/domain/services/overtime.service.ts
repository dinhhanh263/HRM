import { overtimeRepository } from '../repositories/overtime.repository.js';
import { holidayRepository } from '../repositories/holiday.repository.js';
import { approvalFlowRepository } from '../repositories/approval-flow.repository.js';
import { employeeRepository } from '../repositories/employee.repository.js';
import { timesheetPolicyService } from './timesheet-policy.service.js';
import { toOvertimeRequestDto } from '../timesheet/mappers.js';
import {
  deriveOvertimeCategory,
  computeOvertimeMultiplier,
  overtimeCapWarnings,
} from '../timesheet/overtime.helper.js';
import {
  resolveFlow,
  buildApprovalSnapshot,
  findNextActiveStep,
  matchesApprover,
  type FlowCandidate,
  type ApprovalActor,
} from '../leave/approval-routing.helper.js';
import { resolveWorkDate, monthRangeUtc } from '../timesheet/attendance.helper.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors/index.js';
import { ApprovalFlowType } from '@prisma/client';
import type { OvertimeCategory } from '@hrm/shared';
import type { Prisma } from '@prisma/client';
import type {
  CreateOvertimeRequest,
  OvertimeRequestDto,
  OvertimeReviewResultDto,
  OvertimeStatus,
} from '@hrm/shared';

// Sanity cap on a single request's hours. The legal monthly/yearly OT ceilings
// (40h/month, 200h/year) are surfaced as warnings at approval (Task 3.2), not
// hard-blocked here, because BLLĐ caps are advisory for recording purposes.
const MAX_OT_HOURS_PER_REQUEST = 12;

export interface ListOvertimeInput {
  status?: OvertimeStatus;
  month?: string;
  page?: number;
  limit?: number;
}

export interface OvertimeListResult {
  data: OvertimeRequestDto[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const overtimeService = {
  // Employee submits OT for a (past or current) work date. The category is
  // derived server-side from policy workdays + holidays — never trusted from the
  // client — and the multiplier stays null until a reviewer approves (Task 3.2).
  async submit(
    tenantId: string,
    employeeId: string,
    input: CreateOvertimeRequest,
    now: Date = new Date(),
  ): Promise<OvertimeRequestDto> {
    const workDate = resolveWorkDate(input.workDate, now);
    if (!(input.hours > 0)) {
      throw new BadRequestError('Overtime hours must be greater than 0');
    }
    if (input.hours > MAX_OT_HOURS_PER_REQUEST) {
      throw new BadRequestError(
        `Overtime hours cannot exceed ${MAX_OT_HOURS_PER_REQUEST} in a single request`,
      );
    }

    const category = await deriveCategory(tenantId, workDate);
    const night = input.night ?? false;

    const baseData: Prisma.OvertimeRequestCreateInput = {
      tenant: { connect: { id: tenantId } },
      employee: { connect: { id: employeeId } },
      workDate,
      hours: input.hours,
      night,
      category,
      reason: input.reason ?? null,
      status: 'PENDING',
    };

    // Route the request through a configured OT approval flow when one applies;
    // otherwise keep the SPEC-022 legacy single-step behaviour (flowId=null,
    // currentStep=0) so unconfigured tenants are untouched.
    const routed = await resolveFlowSnapshot(tenantId, employeeId);
    if (!routed) {
      const created = await overtimeRepository.create(baseData);
      return toOvertimeRequestDto(created);
    }

    const nextStep = findNextActiveStep(routed.snapshot, 1);
    const fullyApproved = nextStep === null;
    const approvals = snapshotToApprovals(routed.snapshot, tenantId, 1, now);

    // When every step auto-skips, the request is born APPROVED — snapshot the
    // multiplier now so payroll has a settled rate (cap warnings are advisory and
    // surfaced only on an interactive approval).
    const multiplier = fullyApproved
      ? await snapshotMultiplier(tenantId, category, night)
      : undefined;

    const created = await overtimeRepository.createWithApprovals(
      {
        ...baseData,
        flow: { connect: { id: routed.flowId } },
        // currentStep is 1-based; past the last step once fully approved.
        currentStep: fullyApproved ? routed.snapshot.length + 1 : nextStep,
        ...(fullyApproved && {
          status: 'APPROVED',
          multiplier,
          reviewedAt: now,
          reviewNote: 'AUTO_APPROVED',
        }),
      },
      approvals,
    );

    return toOvertimeRequestDto(created);
  },

  // Re-open a RETURNED request after the owner edits it. Re-validates as a fresh
  // submission, re-derives the category, re-resolves the flow, and snapshots a new
  // approval round (maxRound+1) — earlier rounds stay for history.
  async resubmit(
    tenantId: string,
    ownerEmployeeId: string,
    id: string,
    input: CreateOvertimeRequest,
    now: Date = new Date(),
  ): Promise<OvertimeRequestDto> {
    const request = await overtimeRepository.findByIdWithApprovals(tenantId, id);
    if (!request) {
      throw new NotFoundError('Overtime request not found');
    }
    if (request.employeeId !== ownerEmployeeId) {
      throw new ForbiddenError('You can only resubmit your own overtime requests');
    }
    if (request.status !== 'RETURNED') {
      throw new BadRequestError('Only returned requests can be resubmitted', 'OVERTIME_NOT_RETURNED');
    }

    const workDate = resolveWorkDate(input.workDate, now);
    if (!(input.hours > 0)) {
      throw new BadRequestError('Overtime hours must be greater than 0');
    }
    if (input.hours > MAX_OT_HOURS_PER_REQUEST) {
      throw new BadRequestError(
        `Overtime hours cannot exceed ${MAX_OT_HOURS_PER_REQUEST} in a single request`,
      );
    }
    const category = await deriveCategory(tenantId, workDate);
    const night = input.night ?? false;

    // Clear the previous review stamp; the request goes back to square one.
    const baseData: Prisma.OvertimeRequestUpdateInput = {
      workDate,
      hours: input.hours,
      night,
      category,
      reason: input.reason ?? null,
      status: 'PENDING',
      multiplier: null,
      reviewedAt: null,
      reviewNote: null,
      ...(request.reviewedById && { reviewedBy: { disconnect: true } }),
    };

    const routed = await resolveFlowSnapshot(tenantId, ownerEmployeeId);

    // No applicable flow anymore → fall back to legacy single-step pending.
    if (!routed) {
      const updated = await overtimeRepository.resubmit(
        id,
        tenantId,
        { ...baseData, flow: { disconnect: true }, currentStep: 0 },
        [],
      );
      return toOvertimeRequestDto(updated);
    }

    const nextStep = findNextActiveStep(routed.snapshot, 1);
    const fullyApproved = nextStep === null;
    const newRound = currentRound(request.approvals) + 1;
    const approvals = snapshotToApprovals(routed.snapshot, tenantId, newRound, now);
    const multiplier = fullyApproved
      ? await snapshotMultiplier(tenantId, category, night)
      : undefined;

    const updated = await overtimeRepository.resubmit(
      id,
      tenantId,
      {
        ...baseData,
        flow: { connect: { id: routed.flowId } },
        currentStep: fullyApproved ? routed.snapshot.length + 1 : nextStep,
        ...(fullyApproved && {
          status: 'APPROVED',
          multiplier,
          reviewedAt: now,
          reviewNote: 'AUTO_APPROVED',
        }),
      },
      approvals,
    );

    return toOvertimeRequestDto(updated);
  },

  async listMine(
    tenantId: string,
    employeeId: string,
    input: ListOvertimeInput,
  ): Promise<OvertimeListResult> {
    return runList(tenantId, [employeeId], input);
  },

  // employeeIds = restrict to these ids, or null for tenant-wide (HR scope=all
  // browse). A plain status/date list — not the current-step queue.
  async listForReview(
    tenantId: string,
    employeeIds: string[] | null,
    input: ListOvertimeInput,
  ): Promise<OvertimeListResult> {
    return runList(tenantId, employeeIds, input);
  },

  // The actor's review queue: pending requests awaiting *their* decision at the
  // current step. The repository pre-filters to plausible candidates; we then keep
  // only those where the actor matches the active current step, and paginate in
  // memory (a review queue is inherently small).
  async listReviewQueue(
    tenantId: string,
    actor: ApprovalActor,
    input: ListOvertimeInput,
  ): Promise<OvertimeListResult> {
    const range = input.month ? monthRangeUtc(input.month) : undefined;
    const candidates = await overtimeRepository.findReviewCandidates(tenantId, null, actor, {
      status: input.status,
      start: range?.start,
      end: range?.end,
    });
    const matched = candidates.filter((r) => isActorCurrentApprover(r, actor));

    const page = input.page && input.page > 0 ? input.page : 1;
    const limit = input.limit && input.limit > 0 ? Math.min(input.limit, 100) : 20;
    const start = (page - 1) * limit;
    const pageItems = matched.slice(start, start + limit);
    return {
      data: pageItems.map(toOvertimeRequestDto),
      pagination: {
        page,
        limit,
        total: matched.length,
        totalPages: Math.ceil(matched.length / limit),
      },
    };
  },

  // A single request with its full approval timeline (authorization in controller).
  async getById(tenantId: string, id: string): Promise<OvertimeRequestDto> {
    const request = await overtimeRepository.findByIdWithApprovals(tenantId, id);
    if (!request) {
      throw new NotFoundError('Overtime request not found');
    }
    return toOvertimeRequestDto(request);
  },

  // Reviewer approves. Flow-routed requests advance per-step (multiplier
  // snapshotted only at the FINAL step); legacy single-step requests (flowId=null)
  // keep the SPEC-022 one-shot behaviour. The effective multiplier is computed
  // from the current policy + server-derived category and snapshotted so later
  // policy edits never retroactively change settled pay. Monthly/yearly BLLĐ
  // ceilings are returned as advisory warnings — approval is never blocked.
  async approve(
    tenantId: string,
    actor: ApprovalActor,
    id: string,
    now: Date = new Date(),
  ): Promise<OvertimeReviewResultDto> {
    const request = await overtimeRepository.findByIdWithApprovals(tenantId, id);
    if (!request) {
      throw new NotFoundError('Overtime request not found');
    }
    if (request.status !== 'PENDING') {
      throw new ConflictError('Only a pending overtime request can be reviewed');
    }
    if (!request.flowId) {
      return legacyApprove(tenantId, request, actor, now);
    }
    return approveStep(tenantId, request, actor, now);
  },

  // Reviewer rejects. Flow-routed requests are RETURNED to the owner for edit +
  // resubmit (round+1); legacy requests are terminally REJECTED. A note is
  // mandatory in both cases. No multiplier is snapshotted — unsettled OT does not
  // feed payroll.
  async reject(
    tenantId: string,
    actor: ApprovalActor,
    id: string,
    note: string,
    now: Date = new Date(),
  ): Promise<OvertimeRequestDto> {
    const request = await overtimeRepository.findByIdWithApprovals(tenantId, id);
    if (!request) {
      throw new NotFoundError('Overtime request not found');
    }
    if (request.status !== 'PENDING') {
      throw new ConflictError('Only a pending overtime request can be reviewed');
    }
    if (!request.flowId) {
      return legacyReject(tenantId, request, actor, note, now);
    }
    return returnStep(tenantId, request, actor, note, now);
  },

  // The owner withdraws their own still-pending request. Once reviewed it can no
  // longer be cancelled.
  async cancel(
    tenantId: string,
    employeeId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<OvertimeRequestDto> {
    const existing = await overtimeRepository.findById(tenantId, id);
    if (!existing) {
      throw new NotFoundError('Overtime request not found');
    }
    if (existing.employeeId !== employeeId) {
      throw new ForbiddenError('You can only cancel your own overtime requests');
    }
    if (existing.status !== 'PENDING') {
      throw new ConflictError('Only a pending overtime request can be cancelled');
    }
    const updated = await overtimeRepository.update(id, tenantId, { status: 'CANCELLED', reviewedAt: now });
    return toOvertimeRequestDto(updated);
  },
};

/** Derive the OT category for a work date from server-held policy + holidays. */
async function deriveCategory(tenantId: string, workDate: Date): Promise<OvertimeCategory> {
  const policy = await timesheetPolicyService.getPolicy(tenantId);
  const holidays = await holidayRepository.findByYear(tenantId, workDate.getUTCFullYear());
  return deriveOvertimeCategory(
    workDate,
    policy.workdays,
    holidays.map((h) => ({ date: h.date, recurring: h.recurring })),
  );
}

/** Compute the effective pay multiplier from the current policy (snapshot value). */
async function snapshotMultiplier(
  tenantId: string,
  category: OvertimeCategory,
  night: boolean,
): Promise<number> {
  const policy = await timesheetPolicyService.getPolicy(tenantId);
  return computeOvertimeMultiplier(category, night, policy);
}

/** Narrow a persisted OT flow (with relations) down to what the routing engine needs. */
function toFlowCandidate(flow: {
  id: string;
  departmentId: string | null;
  active: boolean;
  steps: {
    stepOrder: number;
    approverType: FlowCandidate['steps'][number]['approverType'];
    roleKey: string | null;
    approverId: string | null;
  }[];
}): FlowCandidate {
  return {
    id: flow.id,
    departmentId: flow.departmentId,
    active: flow.active,
    steps: flow.steps.map((s) => ({
      stepOrder: s.stepOrder,
      approverType: s.approverType,
      roleKey: s.roleKey,
      approverId: s.approverId,
    })),
  };
}

/** Resolve the applicable OVERTIME flow for an employee and snapshot its steps, or null. */
async function resolveFlowSnapshot(tenantId: string, employeeId: string) {
  const routingCtx = await employeeRepository.findRoutingContext(employeeId, tenantId);
  const flows = await approvalFlowRepository.findAll(tenantId, ApprovalFlowType.OVERTIME);
  const flow = resolveFlow(flows.map(toFlowCandidate), routingCtx?.departmentId ?? null);
  if (!flow) return null;

  const snapshot = buildApprovalSnapshot(flow, {
    requesterId: employeeId,
    directManagerId: routingCtx?.managerId ?? null,
    departmentHeadId: routingCtx?.departmentHeadId ?? null,
  });
  return { flowId: flow.id, snapshot };
}

/** Map a routing snapshot into OvertimeApproval createMany rows for a given round. */
function snapshotToApprovals(
  snapshot: ReturnType<typeof buildApprovalSnapshot>,
  tenantId: string,
  round: number,
  now: Date,
) {
  return snapshot.map((s) => ({
    tenantId,
    round,
    stepOrder: s.stepOrder,
    approverType: s.approverType,
    roleKey: s.roleKey,
    approverId: s.approverId,
    // Skipped steps are decided immediately by the system; active steps wait.
    decision: s.skip ? ('AUTO_SKIPPED' as const) : null,
    decidedAt: s.skip ? now : null,
    note: s.skip ? s.skipReason : null,
  }));
}

/** The highest round present on a request's timeline (the round currently running). */
function currentRound(approvals: { round: number }[]): number {
  return approvals.reduce((max, a) => Math.max(max, a.round), 1);
}

/**
 * Is the actor the approver for the request's *current* pending step? Legacy
 * single-step requests (flowId=null) are reviewable by any capability-holder.
 */
function isActorCurrentApprover(request: RequestWithApprovals, actor: ApprovalActor): boolean {
  if (!request.flowId) return true;
  const round = currentRound(request.approvals);
  const current = request.approvals.find(
    (a) => a.round === round && a.stepOrder === request.currentStep && a.decision === null,
  );
  return current ? matchesApprover(current, actor) : false;
}

type RequestWithApprovals = NonNullable<
  Awaited<ReturnType<typeof overtimeRepository.findByIdWithApprovals>>
>;

/**
 * Compute the snapshot multiplier and advisory cap warnings for a request being
 * settled (final approval). The multiplier is frozen onto the request; the
 * warnings inform the reviewer but never block.
 */
async function computeMultiplierAndWarnings(
  tenantId: string,
  request: { category: OvertimeCategory; night: boolean; hours: number; employeeId: string; workDate: Date },
) {
  const policy = await timesheetPolicyService.getPolicy(tenantId);
  const multiplier = computeOvertimeMultiplier(request.category, request.night, policy);

  const month = monthRangeUtc(toMonthKey(request.workDate));
  const year = yearRangeUtc(request.workDate);
  const [monthApproved, yearApproved] = await Promise.all([
    overtimeRepository.sumApprovedHours(tenantId, request.employeeId, month.start, month.end),
    overtimeRepository.sumApprovedHours(tenantId, request.employeeId, year.start, year.end),
  ]);
  const warnings = overtimeCapWarnings(monthApproved + request.hours, yearApproved + request.hours);
  return { multiplier, warnings };
}

/** Legacy SPEC-022 single-step approve: settle in one shot, no timeline. */
async function legacyApprove(
  tenantId: string,
  request: RequestWithApprovals,
  actor: ApprovalActor,
  now: Date,
): Promise<OvertimeReviewResultDto> {
  if (actor.employeeId && request.employeeId === actor.employeeId) {
    throw new ForbiddenError('You cannot review your own overtime request');
  }
  const { multiplier, warnings } = await computeMultiplierAndWarnings(tenantId, request);
  const updated = await overtimeRepository.update(request.id, tenantId, {
    status: 'APPROVED',
    multiplier,
    ...(actor.employeeId && { reviewedBy: { connect: { id: actor.employeeId } } }),
    reviewedAt: now,
    reviewNote: null,
  });
  return { overtime: toOvertimeRequestDto(updated), warnings };
}

/** Legacy SPEC-022 single-step reject: terminal REJECTED with a mandatory note. */
async function legacyReject(
  tenantId: string,
  request: RequestWithApprovals,
  actor: ApprovalActor,
  note: string,
  now: Date,
): Promise<OvertimeRequestDto> {
  if (actor.employeeId && request.employeeId === actor.employeeId) {
    throw new ForbiddenError('You cannot review your own overtime request');
  }
  const updated = await overtimeRepository.update(request.id, tenantId, {
    status: 'REJECTED',
    ...(actor.employeeId && { reviewedBy: { connect: { id: actor.employeeId } } }),
    reviewedAt: now,
    reviewNote: note,
  });
  return toOvertimeRequestDto(updated);
}

/**
 * Approve the current step; advance to the next active step or finalize APPROVED.
 * The multiplier is snapshotted only when this is the last step (settlement).
 */
async function approveStep(
  tenantId: string,
  request: RequestWithApprovals,
  actor: ApprovalActor,
  now: Date,
): Promise<OvertimeReviewResultDto> {
  const round = currentRound(request.approvals);
  const inRound = request.approvals.filter((a) => a.round === round);
  const current = inRound.find((a) => a.stepOrder === request.currentStep && a.decision === null);
  if (!current) {
    throw new BadRequestError('No pending approval step to act on', 'OVERTIME_INVALID_STEP');
  }
  if (!matchesApprover(current, actor)) {
    throw new ForbiddenError(
      'You are not the approver for the current step',
      'OVERTIME_NOT_CURRENT_APPROVER',
    );
  }

  const next = inRound
    .filter((a) => a.stepOrder > request.currentStep && a.decision === null)
    .sort((a, b) => a.stepOrder - b.stepOrder)[0];
  const lastStepOrder = inRound.reduce((max, a) => Math.max(max, a.stepOrder), 0);

  // Only the final approval settles pay → compute multiplier + warnings there.
  let warnings: OvertimeReviewResultDto['warnings'] = [];
  let requestData: Prisma.OvertimeRequestUpdateInput;
  if (next) {
    requestData = { currentStep: next.stepOrder };
  } else {
    const settled = await computeMultiplierAndWarnings(tenantId, request);
    warnings = settled.warnings;
    requestData = {
      status: 'APPROVED',
      multiplier: settled.multiplier,
      // currentStep moves past the final step once fully approved.
      currentStep: lastStepOrder + 1,
      ...(actor.employeeId && { reviewedBy: { connect: { id: actor.employeeId } } }),
      reviewedAt: now,
      reviewNote: 'APPROVED',
    };
  }

  const updated = await overtimeRepository.recordDecision(
    current.id,
    { decision: 'APPROVED', decidedById: actor.employeeId, decidedAt: now, note: null },
    request.id,
    tenantId,
    requestData,
  );
  return { overtime: toOvertimeRequestDto(updated), warnings };
}

/** Return the request to the requester (RETURNED) at any step; note is mandatory. */
async function returnStep(
  tenantId: string,
  request: RequestWithApprovals,
  actor: ApprovalActor,
  note: string,
  now: Date,
): Promise<OvertimeRequestDto> {
  const round = currentRound(request.approvals);
  const current = request.approvals.find(
    (a) => a.round === round && a.stepOrder === request.currentStep && a.decision === null,
  );
  if (!current) {
    throw new BadRequestError('No pending approval step to act on', 'OVERTIME_INVALID_STEP');
  }
  if (!matchesApprover(current, actor)) {
    throw new ForbiddenError(
      'You are not the approver for the current step',
      'OVERTIME_NOT_CURRENT_APPROVER',
    );
  }
  if (!note || !note.trim()) {
    throw new BadRequestError('A note is required when returning a request', 'OVERTIME_RETURN_NOTE_REQUIRED');
  }

  const updated = await overtimeRepository.recordDecision(
    current.id,
    { decision: 'RETURNED', decidedById: actor.employeeId, decidedAt: now, note },
    request.id,
    tenantId,
    {
      status: 'RETURNED',
      ...(actor.employeeId && { reviewedBy: { connect: { id: actor.employeeId } } }),
      reviewedAt: now,
      reviewNote: note,
    },
  );
  return toOvertimeRequestDto(updated);
}

function toMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function yearRangeUtc(date: Date): { start: Date; end: Date } {
  const year = date.getUTCFullYear();
  return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
}

async function runList(
  tenantId: string,
  employeeIds: string[] | null,
  input: ListOvertimeInput,
): Promise<OvertimeListResult> {
  const page = input.page && input.page > 0 ? input.page : 1;
  const limit = input.limit && input.limit > 0 ? Math.min(input.limit, 100) : 20;
  const range = input.month ? monthRangeUtc(input.month) : undefined;

  const { rows, total } = await overtimeRepository.list(tenantId, {
    employeeIds,
    status: input.status,
    start: range?.start,
    end: range?.end,
    page,
    limit,
  });

  return {
    data: rows.map(toOvertimeRequestDto),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
