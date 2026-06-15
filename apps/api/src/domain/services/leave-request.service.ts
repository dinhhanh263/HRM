import { leaveRequestRepository, type LeaveRequestFilters } from '../repositories/leave-request.repository.js';
import { leaveTypeRepository } from '../repositories/leave-type.repository.js';
import { approvalFlowRepository } from '../repositories/approval-flow.repository.js';
import { employeeRepository } from '../repositories/employee.repository.js';
import { leaveBalanceService } from './leave-balance.service.js';
import { toLeaveRequestDto } from '../leave/mappers.js';
import {
  resolveFlow,
  buildApprovalSnapshot,
  findNextActiveStep,
  matchesApprover,
  type FlowCandidate,
  type ApprovalActor,
} from '../leave/approval-routing.helper.js';
import { countWorkingDays } from '../../shared/helpers/working-days.helper.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../shared/errors/index.js';
import type { PaginationOptions } from '../repositories/employee.repository.js';
import type { LeaveStatus, Prisma } from '@prisma/client';
import type { LeaveRequestDto } from '@hrm/shared';

export interface ListLeaveRequestsInput {
  scope?: 'mine' | 'review' | 'all';
  status?: LeaveStatus;
  leaveTypeId?: string;
  year?: number;
  search?: string;
}

export interface CreateLeaveRequestInput {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  halfDay?: boolean;
  reason?: string;
  attachmentUrl?: string;
}

/** Narrow a persisted flow (with relations) down to what the routing engine needs. */
function toFlowCandidate(flow: {
  id: string;
  departmentId: string | null;
  active: boolean;
  steps: { stepOrder: number; approverType: FlowCandidate['steps'][number]['approverType']; roleKey: string | null; approverId: string | null }[];
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

export const leaveRequestService = {
  async list(
    tenantId: string,
    currentEmployeeId: string,
    input: ListLeaveRequestsInput,
    pagination: PaginationOptions,
  ) {
    const filters: LeaveRequestFilters = {
      status: input.status,
      leaveTypeId: input.leaveTypeId,
      year: input.year,
    };

    // 'all' lists every request in the tenant (gated by approve/reject perms at
    // the controller). 'mine' is scoped to the caller.
    if (input.scope === 'all') {
      filters.search = input.search;
    } else {
      filters.employeeId = currentEmployeeId;
    }

    const result = await leaveRequestRepository.findAll(tenantId, filters, pagination);
    return {
      data: result.data.map(toLeaveRequestDto),
      pagination: result.pagination,
    };
  },

  /**
   * The actor's review queue: requests awaiting *their* decision at the current
   * step. The repository pre-filters to plausible candidates; we then keep only
   * those where the actor matches the active current step, and paginate in memory
   * (a review queue is inherently small).
   */
  async listReview(
    tenantId: string,
    actor: ApprovalActor,
    input: ListLeaveRequestsInput,
    pagination: PaginationOptions,
  ) {
    const candidates = await leaveRequestRepository.findReviewCandidates(tenantId, actor, {
      leaveTypeId: input.leaveTypeId,
      year: input.year,
      search: input.search,
    });
    const matched = candidates.filter((r) => isActorCurrentApprover(r, actor));

    const start = (pagination.page - 1) * pagination.limit;
    const pageItems = matched.slice(start, start + pagination.limit);
    return {
      data: pageItems.map(toLeaveRequestDto),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: matched.length,
        totalPages: Math.ceil(matched.length / pagination.limit),
      },
    };
  },

  /** A single request with its full approval timeline (authorization in controller). */
  async getById(id: string, tenantId: string): Promise<LeaveRequestDto> {
    const request = await leaveRequestRepository.findByIdWithApprovals(id, tenantId);
    if (!request) {
      throw new NotFoundError('Leave request not found');
    }
    return toLeaveRequestDto(request);
  },

  async create(
    tenantId: string,
    employeeId: string,
    input: CreateLeaveRequestInput,
  ): Promise<LeaveRequestDto> {
    const { leaveType, startDate, endDate, halfDay, totalDays } = await validateAndCompute(
      tenantId,
      employeeId,
      input,
    );

    const baseData: Prisma.LeaveRequestCreateInput = {
      tenant: { connect: { id: tenantId } },
      employee: { connect: { id: employeeId } },
      leaveType: { connect: { id: leaveType.id } },
      startDate,
      endDate,
      halfDay,
      totalDays,
      reason: input.reason,
      attachmentUrl: input.attachmentUrl,
      status: 'PENDING',
    };

    // Route the request through a configured approval flow when one applies;
    // otherwise keep the SPEC-004 legacy single-step behaviour (flowId=null,
    // currentStep=0) so pre-005 requests and unconfigured tenants are untouched.
    const routed = await resolveFlowSnapshot(tenantId, employeeId);
    if (!routed) {
      const created = await leaveRequestRepository.create(baseData);
      return toLeaveRequestDto(created);
    }

    const now = new Date();
    const nextStep = findNextActiveStep(routed.snapshot, 1);
    const fullyApproved = nextStep === null;
    const approvals = snapshotToApprovals(routed.snapshot, tenantId, 1, now);

    const created = await leaveRequestRepository.createWithApprovals(
      {
        ...baseData,
        flow: { connect: { id: routed.flowId } },
        // currentStep is 1-based; past the last step once fully approved.
        currentStep: fullyApproved ? routed.snapshot.length + 1 : nextStep,
        ...(fullyApproved && {
          status: 'APPROVED',
          reviewedAt: now,
          reviewNote: 'AUTO_APPROVED',
        }),
      },
      approvals,
    );

    return toLeaveRequestDto(created);
  },

  /**
   * Re-open a RETURNED request after the owner edits it. Re-validates as if it
   * were a fresh submission (overlap/quota/attachment), re-resolves the flow, and
   * snapshots a new approval round (maxRound+1) — earlier rounds stay for history.
   */
  async resubmit(
    id: string,
    tenantId: string,
    ownerEmployeeId: string,
    input: CreateLeaveRequestInput,
  ): Promise<LeaveRequestDto> {
    const request = await leaveRequestRepository.findByIdWithApprovals(id, tenantId);
    if (!request) {
      throw new NotFoundError('Leave request not found');
    }
    if (request.employeeId !== ownerEmployeeId) {
      throw new ForbiddenError('You can only resubmit your own leave requests');
    }
    if (request.status !== 'RETURNED') {
      throw new BadRequestError('Only returned requests can be resubmitted', 'LEAVE_NOT_RETURNED');
    }

    const { leaveType, startDate, endDate, halfDay, totalDays } = await validateAndCompute(
      tenantId,
      ownerEmployeeId,
      input,
    );

    // Clear the previous review stamp; the request goes back to square one.
    const baseData: Prisma.LeaveRequestUpdateInput = {
      leaveType: { connect: { id: leaveType.id } },
      startDate,
      endDate,
      halfDay,
      totalDays,
      reason: input.reason ?? null,
      attachmentUrl: input.attachmentUrl ?? null,
      status: 'PENDING',
      reviewedAt: null,
      reviewNote: null,
      ...(request.reviewedById && { reviewedBy: { disconnect: true } }),
    };

    const routed = await resolveFlowSnapshot(tenantId, ownerEmployeeId);

    // No applicable flow anymore → fall back to legacy single-step pending.
    if (!routed) {
      const updated = await leaveRequestRepository.resubmit(
        id,
        tenantId,
        { ...baseData, flow: { disconnect: true }, currentStep: 0 },
        [],
      );
      return toLeaveRequestDto(updated);
    }

    const now = new Date();
    const nextStep = findNextActiveStep(routed.snapshot, 1);
    const fullyApproved = nextStep === null;
    const newRound = currentRound(request.approvals) + 1;
    const approvals = snapshotToApprovals(routed.snapshot, tenantId, newRound, now);

    const updated = await leaveRequestRepository.resubmit(
      id,
      tenantId,
      {
        ...baseData,
        flow: { connect: { id: routed.flowId } },
        currentStep: fullyApproved ? routed.snapshot.length + 1 : nextStep,
        ...(fullyApproved && {
          status: 'APPROVED',
          reviewedAt: now,
          reviewNote: 'AUTO_APPROVED',
        }),
      },
      approvals,
    );

    return toLeaveRequestDto(updated);
  },

  async cancel(id: string, tenantId: string, currentEmployeeId: string): Promise<LeaveRequestDto> {
    const request = await leaveRequestRepository.findById(id, tenantId);
    if (!request) {
      throw new NotFoundError('Leave request not found');
    }
    if (request.employeeId !== currentEmployeeId) {
      throw new ForbiddenError('You can only cancel your own leave requests');
    }
    if (request.status !== 'PENDING' && request.status !== 'APPROVED') {
      throw new BadRequestError('Only pending or approved requests can be cancelled');
    }
    if (request.status === 'APPROVED' && request.startDate <= new Date()) {
      throw new BadRequestError('Cannot cancel a leave that has already started');
    }

    const updated = await leaveRequestRepository.update(id, tenantId, { status: 'CANCELLED' });
    return toLeaveRequestDto(updated);
  },

  async approve(id: string, tenantId: string, actor: ApprovalActor): Promise<LeaveRequestDto> {
    return decide(id, tenantId, actor, 'APPROVED');
  },

  async reject(
    id: string,
    tenantId: string,
    actor: ApprovalActor,
    note?: string,
  ): Promise<LeaveRequestDto> {
    return decide(id, tenantId, actor, 'RETURNED', note);
  },
};

type RequestWithApprovals = NonNullable<
  Awaited<ReturnType<typeof leaveRequestRepository.findByIdWithApprovals>>
>;

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

/**
 * Validate a (re)submission against leave-type rules, working days, overlap and
 * paid-leave balance. Shared by create + resubmit so both enforce the same gates.
 */
async function validateAndCompute(
  tenantId: string,
  employeeId: string,
  input: CreateLeaveRequestInput,
) {
  const leaveType = await leaveTypeRepository.findById(input.leaveTypeId, tenantId);
  if (!leaveType) {
    throw new BadRequestError('Leave type not found', 'LEAVE_TYPE_NOT_FOUND');
  }
  if (!leaveType.active) {
    throw new BadRequestError('This leave type is no longer active', 'LEAVE_TYPE_INACTIVE');
  }
  if (leaveType.requiresAttachment && !input.attachmentUrl) {
    throw new BadRequestError('This leave type requires an attachment', 'LEAVE_ATTACHMENT_REQUIRED');
  }

  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  const halfDay = input.halfDay ?? false;

  const totalDays = countWorkingDays(startDate, endDate, halfDay);
  if (totalDays <= 0) {
    throw new BadRequestError('The selected range contains no working days', 'LEAVE_NO_WORKING_DAYS');
  }

  // A RETURNED request is neither PENDING nor APPROVED, so it never overlaps
  // itself here — no need to exclude the request being resubmitted.
  const overlap = await leaveRequestRepository.findOverlapping(employeeId, startDate, endDate);
  if (overlap) {
    throw new BadRequestError('You already have a leave request overlapping these dates', 'LEAVE_OVERLAP');
  }

  if (leaveType.paid) {
    const year = startDate.getUTCFullYear();
    const balances = await leaveBalanceService.getBalances(tenantId, employeeId, year);
    const balance = balances.find((b) => b.leaveTypeId === leaveType.id);
    if (balance && totalDays > balance.remaining) {
      throw new BadRequestError(
        `Insufficient balance: ${balance.remaining} day(s) remaining, ${totalDays} requested`,
        'LEAVE_INSUFFICIENT_BALANCE',
      );
    }
  }

  return { leaveType, startDate, endDate, halfDay, totalDays };
}

/** Resolve the applicable flow for an employee and snapshot its steps, or null. */
async function resolveFlowSnapshot(tenantId: string, employeeId: string) {
  const routingCtx = await employeeRepository.findRoutingContext(employeeId, tenantId);
  const flows = await approvalFlowRepository.findAll(tenantId);
  const flow = resolveFlow(flows.map(toFlowCandidate), routingCtx?.departmentId ?? null);
  if (!flow) return null;

  const snapshot = buildApprovalSnapshot(flow, {
    requesterId: employeeId,
    directManagerId: routingCtx?.managerId ?? null,
    departmentHeadId: routingCtx?.departmentHeadId ?? null,
  });
  return { flowId: flow.id, snapshot };
}

/** Map a routing snapshot into LeaveApproval createMany rows for a given round. */
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

/**
 * Single entry point for a review action. Flow-based requests are routed through
 * the per-step engine; legacy single-step requests (flowId=null, SPEC-004) keep
 * the original APPROVED/REJECTED behaviour untouched.
 */
async function decide(
  id: string,
  tenantId: string,
  actor: ApprovalActor,
  intent: 'APPROVED' | 'RETURNED',
  note?: string,
): Promise<LeaveRequestDto> {
  const request = await leaveRequestRepository.findByIdWithApprovals(id, tenantId);
  if (!request) {
    throw new NotFoundError('Leave request not found');
  }
  if (request.status !== 'PENDING') {
    throw new BadRequestError('Only pending requests can be reviewed');
  }

  if (!request.flowId) {
    return legacyReview(request, tenantId, actor, intent === 'APPROVED' ? 'APPROVED' : 'REJECTED', note);
  }
  return intent === 'APPROVED'
    ? approveStep(request, tenantId, actor)
    : returnStep(request, tenantId, actor, note);
}

/** Legacy SPEC-004 single-step review: approve/reject in one shot, no timeline. */
async function legacyReview(
  request: RequestWithApprovals,
  tenantId: string,
  actor: ApprovalActor,
  decision: 'APPROVED' | 'REJECTED',
  note?: string,
): Promise<LeaveRequestDto> {
  if (actor.employeeId && request.employeeId === actor.employeeId) {
    throw new ForbiddenError('You cannot review your own leave request');
  }
  const updated = await leaveRequestRepository.update(request.id, tenantId, {
    status: decision,
    // Reviewers without an employee profile (e.g. tenant admins) still stamp the
    // decision time, just without a linked reviewer.
    ...(actor.employeeId && { reviewedBy: { connect: { id: actor.employeeId } } }),
    reviewedAt: new Date(),
    reviewNote: note,
  });
  return toLeaveRequestDto(updated);
}

/** Approve the current step; advance to the next active step or finalize APPROVED. */
async function approveStep(
  request: RequestWithApprovals,
  tenantId: string,
  actor: ApprovalActor,
): Promise<LeaveRequestDto> {
  const round = currentRound(request.approvals);
  const inRound = request.approvals.filter((a) => a.round === round);
  const current = inRound.find((a) => a.stepOrder === request.currentStep && a.decision === null);
  if (!current) {
    throw new BadRequestError('No pending approval step to act on', 'LEAVE_INVALID_STEP');
  }
  if (!matchesApprover(current, actor)) {
    throw new ForbiddenError('You are not the approver for the current step', 'LEAVE_NOT_CURRENT_APPROVER');
  }

  const now = new Date();
  const next = inRound
    .filter((a) => a.stepOrder > request.currentStep && a.decision === null)
    .sort((a, b) => a.stepOrder - b.stepOrder)[0];
  const lastStepOrder = inRound.reduce((max, a) => Math.max(max, a.stepOrder), 0);

  const requestData: Prisma.LeaveRequestUpdateInput = next
    ? { currentStep: next.stepOrder }
    : {
        status: 'APPROVED',
        // currentStep moves past the final step once fully approved.
        currentStep: lastStepOrder + 1,
        ...(actor.employeeId && { reviewedBy: { connect: { id: actor.employeeId } } }),
        reviewedAt: now,
        reviewNote: 'APPROVED',
      };

  const updated = await leaveRequestRepository.recordDecision(
    current.id,
    { decision: 'APPROVED', decidedById: actor.employeeId, decidedAt: now, note: null },
    request.id,
    tenantId,
    requestData,
  );
  return toLeaveRequestDto(updated);
}

/** Return the request to the requester (RETURNED) at any step; note is mandatory. */
async function returnStep(
  request: RequestWithApprovals,
  tenantId: string,
  actor: ApprovalActor,
  note?: string,
): Promise<LeaveRequestDto> {
  const round = currentRound(request.approvals);
  const current = request.approvals.find(
    (a) => a.round === round && a.stepOrder === request.currentStep && a.decision === null,
  );
  if (!current) {
    throw new BadRequestError('No pending approval step to act on', 'LEAVE_INVALID_STEP');
  }
  if (!matchesApprover(current, actor)) {
    throw new ForbiddenError('You are not the approver for the current step', 'LEAVE_NOT_CURRENT_APPROVER');
  }
  if (!note || !note.trim()) {
    throw new BadRequestError('A note is required when returning a request', 'LEAVE_RETURN_NOTE_REQUIRED');
  }

  const now = new Date();
  const updated = await leaveRequestRepository.recordDecision(
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
  return toLeaveRequestDto(updated);
}
