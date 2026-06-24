import {
  paymentRequestRepository,
  type PaymentRequestFilters,
} from '../repositories/payment-request.repository.js';
import { approvalFlowRepository } from '../repositories/approval-flow.repository.js';
import { employeeRepository, type PaginationOptions } from '../repositories/employee.repository.js';
import { toPaymentRequestDto, toPaymentAttachmentDto } from '../payment-request/mappers.js';
import {
  storePaymentFile,
  createPaymentReadStream,
  deletePaymentFile,
} from '../../infrastructure/storage/payment-storage.js';
import { PAYMENT_MAX_FILES, PAYMENT_ALLOWED_MIME } from '../../shared/configs/payment.config.js';
import {
  resolveFlow,
  buildApprovalSnapshot,
  findNextActiveStep,
  matchesApprover,
  type FlowCandidate,
  type ApprovalActor,
  type SnapshotStep,
} from '../leave/approval-routing.helper.js';
import { ApprovalFlowType } from '@prisma/client';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../shared/errors/index.js';
import type { PaymentRequestStatus, PaymentRequestType, Prisma } from '@prisma/client';
import type { PaymentRequestDto, PaymentStatsResponse } from '@hrm/shared';

export interface ListPaymentRequestsInput {
  scope?: 'mine' | 'review' | 'all';
  status?: PaymentRequestStatus;
  type?: PaymentRequestType;
  minAmount?: number;
  maxAmount?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface CreatePaymentRequestInput {
  type: PaymentRequestType;
  title: string;
  description?: string | null;
  amount: number;
  currency?: string;
  expenseDate?: string | null;
  category?: string | null;
  neededByDate?: string | null;
  vendorName?: string | null;
  invoiceNumber?: string | null;
  dueDate?: string | null;
}

export type UpdatePaymentRequestInput = Partial<Omit<CreatePaymentRequestInput, 'type'>>;

/** The submitter's role context — drives Founder/role self-approval (SPEC-041 Đ8). */
export interface RequesterContext {
  isSuperAdmin: boolean;
  roleKey: string | null;
}

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

export const paymentRequestService = {
  async list(
    tenantId: string,
    currentEmployeeId: string,
    input: ListPaymentRequestsInput,
    pagination: PaginationOptions,
  ) {
    const filters: PaymentRequestFilters = {
      status: input.status,
      type: input.type,
      minAmount: input.minAmount,
      maxAmount: input.maxAmount,
      dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
      dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
    };

    // 'all' spans the tenant (gated by approve perm at controller); 'mine' is scoped.
    if (input.scope === 'all') {
      filters.search = input.search;
    } else {
      filters.employeeId = currentEmployeeId;
    }

    const result = await paymentRequestRepository.findAll(tenantId, filters, pagination);
    return {
      items: result.data.map(toPaymentRequestDto),
      total: result.total,
      page: pagination.page,
      limit: pagination.limit,
      totalAmount: result.totalAmount,
    };
  },

  /** The actor's review queue: requests awaiting *their* decision at the current step. */
  async listReview(
    tenantId: string,
    actor: ApprovalActor,
    input: ListPaymentRequestsInput,
    pagination: PaginationOptions,
  ) {
    const candidates = await paymentRequestRepository.findReviewCandidates(tenantId, actor, {
      type: input.type,
      minAmount: input.minAmount,
      maxAmount: input.maxAmount,
      dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
      dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
      search: input.search,
    });
    const matched = candidates.filter((r) => isActorCurrentApprover(r, actor));

    const start = (pagination.page - 1) * pagination.limit;
    const pageItems = matched.slice(start, start + pagination.limit);
    const totalAmount = matched
      .reduce((sum, r) => sum + Number(r.amount), 0)
      .toString();

    return {
      items: pageItems.map(toPaymentRequestDto),
      total: matched.length,
      page: pagination.page,
      limit: pagination.limit,
      totalAmount,
    };
  },

  async getById(id: string, tenantId: string): Promise<PaymentRequestDto> {
    const request = await paymentRequestRepository.findByIdWithApprovals(id, tenantId);
    if (!request) {
      throw new NotFoundError('Payment request not found');
    }
    return toPaymentRequestDto(request);
  },

  /**
   * Rows for an Excel export — respects the same scope + filters as the list
   * (no pagination). 'review' returns the actor's current-step queue; 'all'
   * spans the tenant; 'mine' is scoped to the caller.
   */
  async getExportRows(
    tenantId: string,
    scope: 'mine' | 'review' | 'all',
    currentEmployeeId: string,
    actor: ApprovalActor,
    input: ListPaymentRequestsInput,
  ): Promise<PaymentRequestDto[]> {
    const dateFrom = input.dateFrom ? new Date(input.dateFrom) : undefined;
    const dateTo = input.dateTo ? new Date(input.dateTo) : undefined;

    if (scope === 'review') {
      const candidates = await paymentRequestRepository.findReviewCandidates(tenantId, actor, {
        type: input.type,
        minAmount: input.minAmount,
        maxAmount: input.maxAmount,
        dateFrom,
        dateTo,
        search: input.search,
      });
      return candidates.filter((r) => isActorCurrentApprover(r, actor)).map(toPaymentRequestDto);
    }

    const filters: PaymentRequestFilters = {
      status: input.status,
      type: input.type,
      minAmount: input.minAmount,
      maxAmount: input.maxAmount,
      dateFrom,
      dateTo,
      search: scope === 'all' ? input.search : undefined,
      employeeId: scope === 'all' ? undefined : currentEmployeeId,
    };
    const rows = await paymentRequestRepository.findAllForExport(tenantId, filters);
    return rows.map(toPaymentRequestDto);
  },

  /** Company-wide statistics for one year (monthly + by-type + by-status breakdown). */
  async getStats(tenantId: string, year: number): Promise<PaymentStatsResponse> {
    const rows = await paymentRequestRepository.findForStats(tenantId, year);
    return aggregatePaymentStats(rows, year);
  },

  async create(
    tenantId: string,
    employeeId: string,
    requester: RequesterContext,
    input: CreatePaymentRequestInput,
  ): Promise<PaymentRequestDto> {
    validateByType(input);

    const baseData: Prisma.PaymentRequestCreateInput = {
      tenant: { connect: { id: tenantId } },
      employee: { connect: { id: employeeId } },
      type: input.type,
      title: input.title.trim(),
      description: input.description ?? null,
      amount: input.amount,
      currency: input.currency?.trim() || 'VND',
      status: 'PENDING',
      expenseDate: input.expenseDate ? new Date(input.expenseDate) : null,
      category: input.category ?? null,
      neededByDate: input.neededByDate ? new Date(input.neededByDate) : null,
      vendorName: input.vendorName ?? null,
      invoiceNumber: input.invoiceNumber ?? null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
    };

    const routed = await resolveFlowSnapshot(tenantId, employeeId);
    // Defensive: a tenant should always have the seeded PAYMENT flow. If somehow
    // none resolves, create a plain PENDING request (flowId=null) reviewable by any
    // approve-capability holder — mirrors the Leave legacy fallback.
    if (!routed) {
      const created = await paymentRequestRepository.create(baseData);
      return toPaymentRequestDto(created);
    }

    const snapshot = applySelfApproval(routed.snapshot, requester);

    const now = new Date();
    const nextStep = findNextActiveStep(snapshot, 1);
    const fullyApproved = nextStep === null;
    const approvals = snapshotToApprovals(snapshot, tenantId, 1, now);

    const created = await paymentRequestRepository.createWithApprovals(
      {
        ...baseData,
        flow: { connect: { id: routed.flowId } },
        currentStep: fullyApproved ? snapshot.length + 1 : nextStep,
        ...(fullyApproved && {
          status: 'APPROVED',
          reviewedAt: now,
          reviewNote: 'AUTO_APPROVED',
        }),
      },
      approvals,
    );

    return toPaymentRequestDto(created);
  },

  /** Owner edits a draft while it is still PENDING or RETURNED. Does not re-route. */
  async update(
    id: string,
    tenantId: string,
    ownerEmployeeId: string,
    input: UpdatePaymentRequestInput,
  ): Promise<PaymentRequestDto> {
    const request = await paymentRequestRepository.findById(id, tenantId);
    if (!request) {
      throw new NotFoundError('Payment request not found');
    }
    if (request.employeeId !== ownerEmployeeId) {
      throw new ForbiddenError('You can only edit your own payment requests');
    }
    if (request.status !== 'PENDING' && request.status !== 'RETURNED') {
      throw new BadRequestError('Only pending or returned requests can be edited', 'PAYMENT_NOT_EDITABLE');
    }

    // Validate the resulting (merged) shape against the request's fixed type.
    validateByType({
      type: request.type,
      title: input.title ?? request.title,
      amount: input.amount ?? Number(request.amount),
      expenseDate:
        input.expenseDate !== undefined
          ? input.expenseDate
          : request.expenseDate?.toISOString() ?? null,
      vendorName: input.vendorName !== undefined ? input.vendorName : request.vendorName,
    });

    const data: Prisma.PaymentRequestUpdateInput = {
      ...(input.title !== undefined && { title: input.title.trim() }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.amount !== undefined && { amount: input.amount }),
      ...(input.currency !== undefined && { currency: input.currency.trim() || 'VND' }),
      ...(input.expenseDate !== undefined && {
        expenseDate: input.expenseDate ? new Date(input.expenseDate) : null,
      }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.neededByDate !== undefined && {
        neededByDate: input.neededByDate ? new Date(input.neededByDate) : null,
      }),
      ...(input.vendorName !== undefined && { vendorName: input.vendorName }),
      ...(input.invoiceNumber !== undefined && { invoiceNumber: input.invoiceNumber }),
      ...(input.dueDate !== undefined && { dueDate: input.dueDate ? new Date(input.dueDate) : null }),
    };

    const updated = await paymentRequestRepository.update(id, tenantId, data);
    return toPaymentRequestDto(updated);
  },

  // ---- Attachments ----

  /** Attach an invoice/bill to the owner's editable (PENDING/RETURNED) request. */
  async addAttachment(
    id: string,
    tenantId: string,
    ownerEmployeeId: string,
    file: { buffer: Buffer; originalName: string; mimeType: string; size: number },
  ) {
    await requireEditableOwnRequest(id, tenantId, ownerEmployeeId);

    // Defence-in-depth: the middleware already filters MIME, but never trust it.
    if (!PAYMENT_ALLOWED_MIME.some((a) => a.mime === file.mimeType)) {
      throw new BadRequestError('Loại tệp không được hỗ trợ', 'PAYMENT_UNSUPPORTED_TYPE');
    }
    const count = await paymentRequestRepository.countAttachments(id);
    if (count >= PAYMENT_MAX_FILES) {
      throw new BadRequestError(`Tối đa ${PAYMENT_MAX_FILES} tệp cho mỗi đơn`, 'PAYMENT_TOO_MANY_FILES');
    }

    const stored = await storePaymentFile(file.buffer, file.originalName, file.mimeType);
    const attachment = await paymentRequestRepository.createAttachment({
      request: { connect: { id } },
      fileUrl: stored.fileUrl,
      fileName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
    });
    return toPaymentAttachmentDto(attachment);
  },

  async removeAttachment(
    id: string,
    tenantId: string,
    ownerEmployeeId: string,
    attachmentId: string,
  ): Promise<void> {
    await requireEditableOwnRequest(id, tenantId, ownerEmployeeId);
    const attachment = await paymentRequestRepository.findAttachmentScoped(attachmentId, id, tenantId);
    if (!attachment) {
      throw new NotFoundError('Attachment not found');
    }
    // Remove the DB row first; storage delete is best-effort (missing file never throws).
    await paymentRequestRepository.deleteAttachment(attachmentId);
    await deletePaymentFile(attachment.fileUrl);
  },

  /** Open a read stream for an attachment (caller authorization done in controller). */
  async getDownload(id: string, tenantId: string, attachmentId: string) {
    const attachment = await paymentRequestRepository.findAttachmentScoped(attachmentId, id, tenantId);
    if (!attachment) {
      throw new NotFoundError('Attachment not found');
    }
    const { stream, contentType } = await createPaymentReadStream(attachment.fileUrl);
    return { stream, contentType, fileName: attachment.fileName };
  },

  // ---- Decisions ----

  /** Approve the current step; advance or finalize APPROVED at the last step. */
  async approve(id: string, tenantId: string, actor: ApprovalActor): Promise<PaymentRequestDto> {
    return decide(id, tenantId, actor, 'APPROVED');
  },

  /**
   * Respond to a request: `return` sends it back for edits (RETURNED, resubmittable),
   * `reject` denies it outright (REJECTED, terminal). Note is mandatory for both.
   */
  async respond(
    id: string,
    tenantId: string,
    actor: ApprovalActor,
    mode: 'return' | 'reject',
    note: string,
  ): Promise<PaymentRequestDto> {
    return decide(id, tenantId, actor, mode === 'reject' ? 'REJECTED' : 'RETURNED', note);
  },

  /** Re-open a RETURNED request after the owner edits it; snapshots a new round. */
  async resubmit(
    id: string,
    tenantId: string,
    ownerEmployeeId: string,
    requester: RequesterContext,
    input: CreatePaymentRequestInput,
  ): Promise<PaymentRequestDto> {
    const request = await paymentRequestRepository.findByIdWithApprovals(id, tenantId);
    if (!request) {
      throw new NotFoundError('Payment request not found');
    }
    if (request.employeeId !== ownerEmployeeId) {
      throw new ForbiddenError('You can only resubmit your own payment requests');
    }
    if (request.status !== 'RETURNED') {
      throw new BadRequestError('Only returned requests can be resubmitted', 'PAYMENT_NOT_RETURNED');
    }
    // Type is fixed at creation; resubmit keeps it and re-validates the edited fields.
    validateByType({ ...input, type: request.type });

    const baseData: Prisma.PaymentRequestUpdateInput = {
      title: input.title.trim(),
      description: input.description ?? null,
      amount: input.amount,
      currency: input.currency?.trim() || 'VND',
      status: 'PENDING',
      expenseDate: input.expenseDate ? new Date(input.expenseDate) : null,
      category: input.category ?? null,
      neededByDate: input.neededByDate ? new Date(input.neededByDate) : null,
      vendorName: input.vendorName ?? null,
      invoiceNumber: input.invoiceNumber ?? null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      reviewedAt: null,
      reviewNote: null,
      ...(request.reviewedById && { reviewedBy: { disconnect: true } }),
    };

    const routed = await resolveFlowSnapshot(tenantId, ownerEmployeeId);
    if (!routed) {
      const updated = await paymentRequestRepository.resubmit(
        id,
        tenantId,
        { ...baseData, flow: { disconnect: true }, currentStep: 0 },
        [],
      );
      return toPaymentRequestDto(updated);
    }

    const snapshot = applySelfApproval(routed.snapshot, requester);
    const now = new Date();
    const nextStep = findNextActiveStep(snapshot, 1);
    const fullyApproved = nextStep === null;
    const newRound = currentRound(request.approvals) + 1;
    const approvals = snapshotToApprovals(snapshot, tenantId, newRound, now);

    const updated = await paymentRequestRepository.resubmit(
      id,
      tenantId,
      {
        ...baseData,
        flow: { connect: { id: routed.flowId } },
        currentStep: fullyApproved ? snapshot.length + 1 : nextStep,
        ...(fullyApproved && { status: 'APPROVED', reviewedAt: now, reviewNote: 'AUTO_APPROVED' }),
      },
      approvals,
    );
    return toPaymentRequestDto(updated);
  },

  /** Owner cancels their own non-terminal (PENDING/RETURNED) request. */
  async cancel(id: string, tenantId: string, ownerEmployeeId: string): Promise<PaymentRequestDto> {
    const request = await paymentRequestRepository.findById(id, tenantId);
    if (!request) {
      throw new NotFoundError('Payment request not found');
    }
    if (request.employeeId !== ownerEmployeeId) {
      throw new ForbiddenError('You can only cancel your own payment requests');
    }
    if (request.status !== 'PENDING' && request.status !== 'RETURNED') {
      throw new BadRequestError('Only pending or returned requests can be cancelled', 'PAYMENT_NOT_CANCELLABLE');
    }
    const updated = await paymentRequestRepository.update(id, tenantId, { status: 'CANCELLED' });
    return toPaymentRequestDto(updated);
  },

  /** Mark an APPROVED request as PAID (route-gated by payment_request:mark_paid). */
  async markPaid(
    id: string,
    tenantId: string,
    actor: ApprovalActor,
    paymentNote?: string | null,
  ): Promise<PaymentRequestDto> {
    const request = await paymentRequestRepository.findById(id, tenantId);
    if (!request) {
      throw new NotFoundError('Payment request not found');
    }
    if (request.status !== 'APPROVED') {
      throw new BadRequestError('Only approved requests can be marked as paid', 'PAYMENT_NOT_APPROVED');
    }
    const updated = await paymentRequestRepository.update(id, tenantId, {
      status: 'PAID',
      paidAt: new Date(),
      paymentNote: paymentNote ?? null,
      ...(actor.employeeId && { paidBy: { connect: { id: actor.employeeId } } }),
    });
    return toPaymentRequestDto(updated);
  },
};

/** Load a request that the caller owns and that is still editable (PENDING/RETURNED). */
async function requireEditableOwnRequest(id: string, tenantId: string, ownerEmployeeId: string) {
  const request = await paymentRequestRepository.findById(id, tenantId);
  if (!request) {
    throw new NotFoundError('Payment request not found');
  }
  if (request.employeeId !== ownerEmployeeId) {
    throw new ForbiddenError('You can only modify your own payment requests');
  }
  if (request.status !== 'PENDING' && request.status !== 'RETURNED') {
    throw new BadRequestError('Attachments can only be changed while pending or returned', 'PAYMENT_NOT_EDITABLE');
  }
  return request;
}

type RequestWithApprovals = NonNullable<
  Awaited<ReturnType<typeof paymentRequestRepository.findByIdWithApprovals>>
>;

function currentRound(approvals: { round: number }[]): number {
  return approvals.reduce((max, a) => Math.max(max, a.round), 1);
}

function isActorCurrentApprover(request: RequestWithApprovals, actor: ApprovalActor): boolean {
  if (!request.flowId) return true;
  const round = currentRound(request.approvals);
  const current = request.approvals.find(
    (a) => a.round === round && a.stepOrder === request.currentStep && a.decision === null,
  );
  return current ? matchesApprover(current, actor) : false;
}

function requesterSatisfiesRole(roleKey: string | null, requester: RequesterContext): boolean {
  if (requester.isSuperAdmin) return true;
  return roleKey !== null && requester.roleKey === roleKey;
}

/**
 * SPEC-041 Đ8: a ROLE step the *submitter themselves* satisfies (Founder =
 * super_admin) is auto-skipped — the Founder never approves their own request.
 */
function applySelfApproval(snapshot: SnapshotStep[], requester: RequesterContext): SnapshotStep[] {
  return snapshot.map((s) =>
    !s.skip && s.approverType === 'ROLE' && requesterSatisfiesRole(s.roleKey, requester)
      ? { ...s, skip: true, skipReason: 'SELF_APPROVAL' }
      : s,
  );
}

/**
 * Single entry point for a review action. Flow requests route through the per-step
 * engine; the defensive flowId=null case (no seeded flow resolved) falls back to a
 * one-shot decision. A reviewer can never act on their own request.
 */
async function decide(
  id: string,
  tenantId: string,
  actor: ApprovalActor,
  intent: 'APPROVED' | 'RETURNED' | 'REJECTED',
  note?: string,
): Promise<PaymentRequestDto> {
  const request = await paymentRequestRepository.findByIdWithApprovals(id, tenantId);
  if (!request) {
    throw new NotFoundError('Payment request not found');
  }
  if (request.status !== 'PENDING') {
    throw new BadRequestError('Only pending requests can be reviewed', 'PAYMENT_NOT_PENDING');
  }
  if (actor.employeeId && request.employeeId === actor.employeeId) {
    throw new ForbiddenError('You cannot review your own payment request', 'PAYMENT_SELF_REVIEW');
  }

  if (!request.flowId) {
    return legacyReview(request, tenantId, actor, intent, note);
  }
  return intent === 'APPROVED'
    ? approveStep(request, tenantId, actor)
    : returnOrRejectStep(request, tenantId, actor, intent, note);
}

/** Defensive single-step review for a flowId=null request (no timeline). */
async function legacyReview(
  request: RequestWithApprovals,
  tenantId: string,
  actor: ApprovalActor,
  intent: 'APPROVED' | 'RETURNED' | 'REJECTED',
  note?: string,
): Promise<PaymentRequestDto> {
  if (intent !== 'APPROVED' && (!note || !note.trim())) {
    throw new BadRequestError('A note is required', 'PAYMENT_NOTE_REQUIRED');
  }
  const updated = await paymentRequestRepository.update(request.id, tenantId, {
    status: intent,
    ...(actor.employeeId && { reviewedBy: { connect: { id: actor.employeeId } } }),
    reviewedAt: new Date(),
    reviewNote: note ?? intent,
  });
  return toPaymentRequestDto(updated);
}

/** Approve the current step; advance to the next active step or finalize APPROVED. */
async function approveStep(
  request: RequestWithApprovals,
  tenantId: string,
  actor: ApprovalActor,
): Promise<PaymentRequestDto> {
  const round = currentRound(request.approvals);
  const inRound = request.approvals.filter((a) => a.round === round);
  const current = inRound.find((a) => a.stepOrder === request.currentStep && a.decision === null);
  if (!current) {
    throw new BadRequestError('No pending approval step to act on', 'PAYMENT_INVALID_STEP');
  }
  if (!matchesApprover(current, actor)) {
    throw new ForbiddenError('You are not the approver for the current step', 'PAYMENT_NOT_CURRENT_APPROVER');
  }

  const now = new Date();
  const next = inRound
    .filter((a) => a.stepOrder > request.currentStep && a.decision === null)
    .sort((a, b) => a.stepOrder - b.stepOrder)[0];
  const lastStepOrder = inRound.reduce((max, a) => Math.max(max, a.stepOrder), 0);

  const requestData: Prisma.PaymentRequestUpdateInput = next
    ? { currentStep: next.stepOrder }
    : {
        status: 'APPROVED',
        currentStep: lastStepOrder + 1,
        ...(actor.employeeId && { reviewedBy: { connect: { id: actor.employeeId } } }),
        reviewedAt: now,
        reviewNote: 'APPROVED',
      };

  const updated = await paymentRequestRepository.recordDecision(
    current.id,
    { decision: 'APPROVED', decidedById: actor.employeeId, decidedAt: now, note: null },
    request.id,
    tenantId,
    requestData,
  );
  return toPaymentRequestDto(updated);
}

/** Return (RETURNED, resubmittable) or reject (REJECTED, terminal) the current step. */
async function returnOrRejectStep(
  request: RequestWithApprovals,
  tenantId: string,
  actor: ApprovalActor,
  intent: 'RETURNED' | 'REJECTED',
  note?: string,
): Promise<PaymentRequestDto> {
  const round = currentRound(request.approvals);
  const current = request.approvals.find(
    (a) => a.round === round && a.stepOrder === request.currentStep && a.decision === null,
  );
  if (!current) {
    throw new BadRequestError('No pending approval step to act on', 'PAYMENT_INVALID_STEP');
  }
  if (!matchesApprover(current, actor)) {
    throw new ForbiddenError('You are not the approver for the current step', 'PAYMENT_NOT_CURRENT_APPROVER');
  }
  if (!note || !note.trim()) {
    throw new BadRequestError('A note is required', 'PAYMENT_NOTE_REQUIRED');
  }

  const now = new Date();
  const updated = await paymentRequestRepository.recordDecision(
    current.id,
    { decision: intent, decidedById: actor.employeeId, decidedAt: now, note },
    request.id,
    tenantId,
    {
      status: intent,
      ...(actor.employeeId && { reviewedBy: { connect: { id: actor.employeeId } } }),
      reviewedAt: now,
      reviewNote: note,
    },
  );
  return toPaymentRequestDto(updated);
}

/** Type-specific required-field validation (defence-in-depth alongside the Zod schema). */
function validateByType(input: {
  type: PaymentRequestType;
  title: string;
  amount: number;
  expenseDate?: string | null;
  vendorName?: string | null;
}) {
  if (!input.title?.trim()) {
    throw new BadRequestError('Title is required', 'PAYMENT_TITLE_REQUIRED');
  }
  if (!(input.amount > 0)) {
    throw new BadRequestError('Amount must be greater than 0', 'PAYMENT_INVALID_AMOUNT');
  }
  if (input.type === 'REIMBURSEMENT' && !input.expenseDate) {
    throw new BadRequestError('Expense date is required for reimbursement', 'PAYMENT_EXPENSE_DATE_REQUIRED');
  }
  if (input.type === 'VENDOR_PAYMENT' && !input.vendorName?.trim()) {
    throw new BadRequestError('Vendor name is required for vendor payment', 'PAYMENT_VENDOR_REQUIRED');
  }
}

async function resolveFlowSnapshot(tenantId: string, employeeId: string) {
  const routingCtx = await employeeRepository.findRoutingContext(employeeId, tenantId);
  const flows = await approvalFlowRepository.findAll(tenantId, ApprovalFlowType.PAYMENT);
  const flow = resolveFlow(flows.map(toFlowCandidate), routingCtx?.departmentId ?? null);
  if (!flow) return null;

  const snapshot = buildApprovalSnapshot(flow, {
    requesterId: employeeId,
    directManagerId: routingCtx?.managerId ?? null,
    departmentHeadId: routingCtx?.departmentHeadId ?? null,
  });
  return { flowId: flow.id, snapshot };
}

/** Round to 2dp and stringify (VND has no decimals; guards float artifacts). */
function money(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/**
 * Pure aggregation for company-wide yearly stats — exported for unit testing.
 * Buckets rows by month of `createdAt`, and totals by type and status.
 */
export function aggregatePaymentStats(
  rows: { createdAt: Date; amount: Prisma.Decimal | number | string; type: string; status: string }[],
  year: number,
): PaymentStatsResponse {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, _total: 0, count: 0 }));
  const byType = new Map<string, { total: number; count: number }>();
  const byStatus = new Map<string, { total: number; count: number }>();
  let grandTotal = 0;
  let paidTotal = 0;
  let pendingTotal = 0;

  for (const r of rows) {
    const amt = Number(r.amount);
    const m = r.createdAt.getUTCMonth(); // 0–11
    months[m]._total += amt;
    months[m].count += 1;
    grandTotal += amt;
    if (r.status === 'PAID') paidTotal += amt;
    if (r.status === 'PENDING') pendingTotal += amt;

    const t = byType.get(r.type) ?? { total: 0, count: 0 };
    t.total += amt;
    t.count += 1;
    byType.set(r.type, t);

    const s = byStatus.get(r.status) ?? { total: 0, count: 0 };
    s.total += amt;
    s.count += 1;
    byStatus.set(r.status, s);
  }

  return {
    year,
    months: months.map((mo) => ({ month: mo.month, total: money(mo._total), count: mo.count })),
    byType: [...byType.entries()].map(([key, v]) => ({ key, total: money(v.total), count: v.count })),
    byStatus: [...byStatus.entries()].map(([key, v]) => ({ key, total: money(v.total), count: v.count })),
    grandTotal: money(grandTotal),
    grandCount: rows.length,
    paidTotal: money(paidTotal),
    pendingTotal: money(pendingTotal),
  };
}

function snapshotToApprovals(snapshot: SnapshotStep[], tenantId: string, round: number, now: Date) {
  return snapshot.map((s) => ({
    tenantId,
    round,
    stepOrder: s.stepOrder,
    approverType: s.approverType,
    roleKey: s.roleKey,
    approverId: s.approverId,
    decision: s.skip ? ('AUTO_SKIPPED' as const) : null,
    decidedAt: s.skip ? now : null,
    note: s.skip ? s.skipReason : null,
  }));
}
