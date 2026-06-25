import {
  purchaseRequestRepository,
  type PurchaseRequestFilters,
} from '../repositories/purchase-request.repository.js';
import { approvalFlowRepository } from '../repositories/approval-flow.repository.js';
import { issuingEntityRepository } from '../repositories/issuing-entity.repository.js';
import { employeeRepository, type PaginationOptions } from '../repositories/employee.repository.js';
import { toPurchaseRequestDto, toPurchaseAttachmentDto } from '../purchase-request/mappers.js';
import {
  storePurchaseFile,
  createPurchaseReadStream,
  deletePurchaseFile,
} from '../../infrastructure/storage/purchase-storage.js';
import { PURCHASE_MAX_FILES, PURCHASE_ALLOWED_MIME } from '../../shared/configs/purchase.config.js';
import { renderPurchaseOrderPdf, type PoPdfCompany } from '../purchase-request/po.pdf.js';
import { readEntityLogo } from '../../infrastructure/storage/entity-logo-storage.js';
import { settingsService } from './settings.service.js';
import { logger } from '../../shared/utils/logger.js';
import {
  resolveFlow,
  buildApprovalSnapshot,
  findNextActiveStep,
  matchesApprover,
  type FlowCandidate,
  type ApprovalActor,
  type SnapshotStep,
} from '../leave/approval-routing.helper.js';
import { ApprovalFlowType, Prisma } from '@prisma/client';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../shared/errors/index.js';
import type { PurchaseRequestStatus } from '@prisma/client';
import type { PurchaseRequestDto, PurchaseStatsResponse } from '@hrm/shared';

export interface ListPurchaseRequestsInput {
  scope?: 'mine' | 'review' | 'all';
  status?: PurchaseRequestStatus;
  vendorName?: string;
  minAmount?: number;
  maxAmount?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface PurchaseItemInput {
  sku?: string | null;
  productName: string;
  unit?: string | null;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
}

export interface CreatePurchaseRequestInput {
  title: string;
  description?: string | null;
  vendorName: string;
  expectedDeliveryDate?: string | null;
  currency?: string;
  issuingEntityId?: string | null; // SPEC-043
  items: PurchaseItemInput[];
}

export type UpdatePurchaseRequestInput = CreatePurchaseRequestInput;

/** The submitter's role context — drives Founder/role self-approval (mirror SPEC-041). */
export interface RequesterContext {
  isSuperAdmin: boolean;
  roleKey: string | null;
}

const MAX_CODE_RETRIES = 5;

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

export const purchaseRequestService = {
  async list(
    tenantId: string,
    currentEmployeeId: string,
    input: ListPurchaseRequestsInput,
    pagination: PaginationOptions,
  ) {
    const filters: PurchaseRequestFilters = {
      status: input.status,
      vendorName: input.vendorName,
      minAmount: input.minAmount,
      maxAmount: input.maxAmount,
      dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
      dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
    };

    if (input.scope === 'all') {
      filters.search = input.search;
    } else {
      filters.employeeId = currentEmployeeId;
    }

    const result = await purchaseRequestRepository.findAll(tenantId, filters, pagination);
    return {
      items: result.data.map(toPurchaseRequestDto),
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
    input: ListPurchaseRequestsInput,
    pagination: PaginationOptions,
  ) {
    const candidates = await purchaseRequestRepository.findReviewCandidates(tenantId, actor, {
      vendorName: input.vendorName,
      minAmount: input.minAmount,
      maxAmount: input.maxAmount,
      dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
      dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
      search: input.search,
    });
    const matched = candidates.filter((r) => isActorCurrentApprover(r, actor));

    const start = (pagination.page - 1) * pagination.limit;
    const pageItems = matched.slice(start, start + pagination.limit);
    const totalAmount = matched.reduce((sum, r) => sum + Number(r.totalAmount), 0).toString();

    return {
      items: pageItems.map(toPurchaseRequestDto),
      total: matched.length,
      page: pagination.page,
      limit: pagination.limit,
      totalAmount,
    };
  },

  async getById(id: string, tenantId: string): Promise<PurchaseRequestDto> {
    const request = await purchaseRequestRepository.findByIdWithApprovals(id, tenantId);
    if (!request) {
      throw new NotFoundError('Purchase request not found');
    }
    return toPurchaseRequestDto(request);
  },

  /**
   * Render the purchase requisition as a PO PDF (A4). Company header is sourced
   * from Tenant.settings.company; "Thành Tiền" per line is the pre-tax subtotal
   * (matches the sample invoice). Returns the buffer + a `<code>.pdf` filename.
   */
  async renderPdf(
    tenantId: string,
    id: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const request = await purchaseRequestRepository.findByIdWithApprovals(id, tenantId);
    if (!request) {
      throw new NotFoundError('Purchase request not found');
    }

    // SPEC-043: prefer the request's issuing snapshot (frozen at create/edit). When
    // the phiếu has no snapshot (legacy / none chosen), fall back to settings.company
    // with no logo — preserving the original SPEC-042 behaviour.
    let company: PoPdfCompany;
    let logoBuffer: Buffer | null = null;
    if (request.issuingCompanyName) {
      company = {
        name: request.issuingCompanyName,
        address: request.issuingAddress ?? '',
        taxCode: request.issuingTaxCode ?? '',
        phone: request.issuingPhone ?? '',
      };
      if (request.issuingLogoUrl) {
        try {
          logoBuffer = await readEntityLogo(request.issuingLogoUrl);
        } catch (err) {
          // A missing/unreadable logo must not block the PDF — render without it.
          logger.warn({ err, requestId: id }, 'Issuing logo unreadable; rendering PO without logo');
        }
      }
    } else {
      const info = await settingsService.getCompanyInfo(tenantId);
      company = { name: info.name, address: info.address, taxCode: info.taxCode, phone: info.phone };
    }

    const buffer = await renderPurchaseOrderPdf({
      company,
      logoBuffer,
      code: request.code,
      createdAt: request.createdAt,
      requesterName: request.employee?.fullName ?? '—',
      departmentName: request.employee?.department?.name ?? null,
      vendorName: request.vendorName,
      expectedDeliveryDate: request.expectedDeliveryDate ?? null,
      description: request.description,
      items: request.items.map((i) => ({
        lineNo: i.lineNo,
        sku: i.sku,
        productName: i.productName,
        unit: i.unit,
        quantity: i.quantity.toString(),
        unitPrice: i.unitPrice.toString(),
        lineSubtotal: i.lineSubtotal.toString(),
      })),
      subtotal: request.subtotal.toString(),
      taxAmount: request.taxAmount.toString(),
      totalAmount: request.totalAmount.toString(),
      reviewedByName: request.reviewedBy?.fullName ?? null,
    });

    return { buffer, filename: `${request.code}.pdf` };
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
    input: ListPurchaseRequestsInput,
  ): Promise<PurchaseRequestDto[]> {
    const dateFrom = input.dateFrom ? new Date(input.dateFrom) : undefined;
    const dateTo = input.dateTo ? new Date(input.dateTo) : undefined;

    if (scope === 'review') {
      const candidates = await purchaseRequestRepository.findReviewCandidates(tenantId, actor, {
        vendorName: input.vendorName,
        minAmount: input.minAmount,
        maxAmount: input.maxAmount,
        dateFrom,
        dateTo,
        search: input.search,
      });
      return candidates.filter((r) => isActorCurrentApprover(r, actor)).map(toPurchaseRequestDto);
    }

    const filters: PurchaseRequestFilters = {
      status: input.status,
      vendorName: input.vendorName,
      minAmount: input.minAmount,
      maxAmount: input.maxAmount,
      dateFrom,
      dateTo,
      search: scope === 'all' ? input.search : undefined,
      employeeId: scope === 'all' ? undefined : currentEmployeeId,
    };
    const rows = await purchaseRequestRepository.findAllForExport(tenantId, filters);
    return rows.map(toPurchaseRequestDto);
  },

  /** Company-wide statistics for one year (monthly + by-status/department/vendor). */
  async getStats(tenantId: string, year: number): Promise<PurchaseStatsResponse> {
    const rows = await purchaseRequestRepository.findForStats(tenantId, year);
    return aggregatePurchaseStats(
      rows.map((r) => ({
        createdAt: r.createdAt,
        totalAmount: r.totalAmount,
        status: r.status,
        departmentName: r.employee?.department?.name ?? null,
        vendorName: r.vendorName,
      })),
      year,
    );
  },

  async create(
    tenantId: string,
    employeeId: string,
    requester: RequesterContext,
    input: CreatePurchaseRequestInput,
  ): Promise<PurchaseRequestDto> {
    validateInput(input);
    const totals = computeTotals(input.items);
    // SPEC-043: resolve + snapshot the issuing entity (must be active on create).
    const issuing = await resolveIssuingSnapshot(tenantId, input.issuingEntityId, {
      requireActive: true,
    });

    const headerBase = {
      tenant: { connect: { id: tenantId } },
      employee: { connect: { id: employeeId } },
      title: input.title.trim(),
      description: input.description ?? null,
      vendorName: input.vendorName.trim(),
      expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null,
      currency: input.currency?.trim() || 'VND',
      status: 'PENDING' as const,
      subtotal: new Prisma.Decimal(totals.subtotal),
      taxAmount: new Prisma.Decimal(totals.taxAmount),
      totalAmount: new Prisma.Decimal(totals.totalAmount),
      ...(issuing.issuingEntityId
        ? { issuingEntity: { connect: { id: issuing.issuingEntityId } } }
        : {}),
      issuingCompanyName: issuing.issuingCompanyName,
      issuingAddress: issuing.issuingAddress,
      issuingTaxCode: issuing.issuingTaxCode,
      issuingPhone: issuing.issuingPhone,
      issuingLogoUrl: issuing.issuingLogoUrl,
      items: { create: totals.lines.map(lineToCreate) },
    };

    const routed = await resolveFlowSnapshot(tenantId, employeeId);

    const now = new Date();
    let flowFields: Partial<Prisma.PurchaseRequestCreateInput>;
    let approvals: ReturnType<typeof snapshotToApprovals>;
    if (!routed) {
      // Defensive: a tenant should always have the seeded PURCHASE flow. If somehow
      // none resolves, create a plain PENDING request (flowId=null) reviewable by any
      // approve-capability holder.
      flowFields = {};
      approvals = [];
    } else {
      const snapshot = applySelfApproval(routed.snapshot, requester);
      const nextStep = findNextActiveStep(snapshot, 1);
      const fullyApproved = nextStep === null;
      approvals = snapshotToApprovals(snapshot, tenantId, 1, now);
      flowFields = {
        flow: { connect: { id: routed.flowId } },
        currentStep: fullyApproved ? snapshot.length + 1 : (nextStep as number),
        ...(fullyApproved && { status: 'APPROVED', reviewedAt: now, reviewNote: 'AUTO_APPROVED' }),
      };
    }

    // Generate the daily code inside the create transaction; retry on the rare
    // (tenantId, code) unique collision (two requests in the same ms).
    const created = await createWithGeneratedCode(tenantId, async (code) =>
      purchaseRequestRepository.createWithApprovals({ ...headerBase, ...flowFields, code }, approvals),
    );

    return toPurchaseRequestDto(created);
  },

  /**
   * Owner edits a draft while it is still PENDING or RETURNED. Replaces the full
   * items array and recomputes totals. Does not re-route.
   */
  async update(
    id: string,
    tenantId: string,
    ownerEmployeeId: string,
    input: UpdatePurchaseRequestInput,
  ): Promise<PurchaseRequestDto> {
    const request = await purchaseRequestRepository.findById(id, tenantId);
    if (!request) {
      throw new NotFoundError('Purchase request not found');
    }
    if (request.employeeId !== ownerEmployeeId) {
      throw new ForbiddenError('You can only edit your own purchase requests');
    }
    if (request.status !== 'PENDING' && request.status !== 'RETURNED') {
      throw new BadRequestError('Only pending or returned requests can be edited', 'PURCHASE_NOT_EDITABLE');
    }

    validateInput(input);
    const totals = computeTotals(input.items);
    // SPEC-043: re-resolve + re-snapshot the issuing entity on edit. requireActive
    // is false so the owner can keep an issuer that was hidden after they chose it.
    const issuing = await resolveIssuingSnapshot(tenantId, input.issuingEntityId, {
      requireActive: false,
    });

    const data: Prisma.PurchaseRequestUpdateInput = {
      title: input.title.trim(),
      description: input.description ?? null,
      vendorName: input.vendorName.trim(),
      expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null,
      currency: input.currency?.trim() || 'VND',
      subtotal: new Prisma.Decimal(totals.subtotal),
      taxAmount: new Prisma.Decimal(totals.taxAmount),
      totalAmount: new Prisma.Decimal(totals.totalAmount),
      ...issuingRelationUpdate(issuing),
      issuingCompanyName: issuing.issuingCompanyName,
      issuingAddress: issuing.issuingAddress,
      issuingTaxCode: issuing.issuingTaxCode,
      issuingPhone: issuing.issuingPhone,
      issuingLogoUrl: issuing.issuingLogoUrl,
    };

    const updated = await purchaseRequestRepository.updateWithItems(
      id,
      tenantId,
      data,
      totals.lines.map(lineToCreate),
    );
    return toPurchaseRequestDto(updated);
  },

  // ---- Attachments ----

  /** Attach a quote/contract to the owner's active request (any status but
      REJECTED/CANCELLED), so documents can be added even after approval. */
  async addAttachment(
    id: string,
    tenantId: string,
    ownerEmployeeId: string,
    file: { buffer: Buffer; originalName: string; mimeType: string; size: number },
  ) {
    await requireAttachableOwnRequest(id, tenantId, ownerEmployeeId);

    // Defence-in-depth: the middleware already filters MIME, but never trust it.
    if (!PURCHASE_ALLOWED_MIME.some((a) => a.mime === file.mimeType)) {
      throw new BadRequestError('Loại tệp không được hỗ trợ', 'PURCHASE_UNSUPPORTED_TYPE');
    }
    const count = await purchaseRequestRepository.countAttachments(id);
    if (count >= PURCHASE_MAX_FILES) {
      throw new BadRequestError(`Tối đa ${PURCHASE_MAX_FILES} tệp cho mỗi phiếu`, 'PURCHASE_TOO_MANY_FILES');
    }

    const stored = await storePurchaseFile(file.buffer, file.originalName, file.mimeType);
    const attachment = await purchaseRequestRepository.createAttachment({
      request: { connect: { id } },
      fileUrl: stored.fileUrl,
      fileName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
    });
    return toPurchaseAttachmentDto(attachment);
  },

  async removeAttachment(
    id: string,
    tenantId: string,
    ownerEmployeeId: string,
    attachmentId: string,
  ): Promise<void> {
    await requireAttachableOwnRequest(id, tenantId, ownerEmployeeId);
    const attachment = await purchaseRequestRepository.findAttachmentScoped(attachmentId, id, tenantId);
    if (!attachment) {
      throw new NotFoundError('Attachment not found');
    }
    // Remove the DB row first; storage delete is best-effort (missing file never throws).
    await purchaseRequestRepository.deleteAttachment(attachmentId);
    await deletePurchaseFile(attachment.fileUrl);
  },

  /** Open a read stream for an attachment (caller authorization done in controller). */
  async getDownload(id: string, tenantId: string, attachmentId: string) {
    const attachment = await purchaseRequestRepository.findAttachmentScoped(attachmentId, id, tenantId);
    if (!attachment) {
      throw new NotFoundError('Attachment not found');
    }
    const { stream, contentType } = await createPurchaseReadStream(attachment.fileUrl);
    return { stream, contentType, fileName: attachment.fileName };
  },

  // ---- Decisions ----

  /** Approve the current step; advance or finalize APPROVED at the last step. */
  async approve(id: string, tenantId: string, actor: ApprovalActor): Promise<PurchaseRequestDto> {
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
  ): Promise<PurchaseRequestDto> {
    return decide(id, tenantId, actor, mode === 'reject' ? 'REJECTED' : 'RETURNED', note);
  },

  /** Re-open a RETURNED request after the owner edits it; snapshots a new round. */
  async resubmit(
    id: string,
    tenantId: string,
    ownerEmployeeId: string,
    requester: RequesterContext,
    input: CreatePurchaseRequestInput,
  ): Promise<PurchaseRequestDto> {
    const request = await purchaseRequestRepository.findByIdWithApprovals(id, tenantId);
    if (!request) {
      throw new NotFoundError('Purchase request not found');
    }
    if (request.employeeId !== ownerEmployeeId) {
      throw new ForbiddenError('You can only resubmit your own purchase requests');
    }
    if (request.status !== 'RETURNED') {
      throw new BadRequestError('Only returned requests can be resubmitted', 'PURCHASE_NOT_RETURNED');
    }
    validateInput(input);
    const totals = computeTotals(input.items);
    // SPEC-043: re-snapshot on resubmit too (the owner may have changed the issuer).
    const issuing = await resolveIssuingSnapshot(tenantId, input.issuingEntityId, {
      requireActive: false,
    });

    const baseData: Prisma.PurchaseRequestUpdateInput = {
      title: input.title.trim(),
      description: input.description ?? null,
      vendorName: input.vendorName.trim(),
      expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null,
      currency: input.currency?.trim() || 'VND',
      ...issuingRelationUpdate(issuing),
      issuingCompanyName: issuing.issuingCompanyName,
      issuingAddress: issuing.issuingAddress,
      issuingTaxCode: issuing.issuingTaxCode,
      issuingPhone: issuing.issuingPhone,
      issuingLogoUrl: issuing.issuingLogoUrl,
      status: 'PENDING',
      subtotal: new Prisma.Decimal(totals.subtotal),
      taxAmount: new Prisma.Decimal(totals.taxAmount),
      totalAmount: new Prisma.Decimal(totals.totalAmount),
      reviewedAt: null,
      reviewNote: null,
      ...(request.reviewedById && { reviewedBy: { disconnect: true } }),
    };
    const items = totals.lines.map(lineToCreate);

    const routed = await resolveFlowSnapshot(tenantId, ownerEmployeeId);
    if (!routed) {
      const updated = await purchaseRequestRepository.resubmit(
        id,
        tenantId,
        { ...baseData, flow: { disconnect: true }, currentStep: 0 },
        items,
        [],
      );
      return toPurchaseRequestDto(updated);
    }

    const snapshot = applySelfApproval(routed.snapshot, requester);
    const now = new Date();
    const nextStep = findNextActiveStep(snapshot, 1);
    const fullyApproved = nextStep === null;
    const newRound = currentRound(request.approvals) + 1;
    const approvals = snapshotToApprovals(snapshot, tenantId, newRound, now);

    const updated = await purchaseRequestRepository.resubmit(
      id,
      tenantId,
      {
        ...baseData,
        flow: { connect: { id: routed.flowId } },
        currentStep: fullyApproved ? snapshot.length + 1 : nextStep,
        ...(fullyApproved && { status: 'APPROVED', reviewedAt: now, reviewNote: 'AUTO_APPROVED' }),
      },
      items,
      approvals,
    );
    return toPurchaseRequestDto(updated);
  },

  /** Owner cancels their own non-terminal (PENDING/RETURNED) request. */
  async cancel(id: string, tenantId: string, ownerEmployeeId: string): Promise<PurchaseRequestDto> {
    const request = await purchaseRequestRepository.findById(id, tenantId);
    if (!request) {
      throw new NotFoundError('Purchase request not found');
    }
    if (request.employeeId !== ownerEmployeeId) {
      throw new ForbiddenError('You can only cancel your own purchase requests');
    }
    if (request.status !== 'PENDING' && request.status !== 'RETURNED') {
      throw new BadRequestError('Only pending or returned requests can be cancelled', 'PURCHASE_NOT_CANCELLABLE');
    }
    const updated = await purchaseRequestRepository.update(id, tenantId, { status: 'CANCELLED' });
    return toPurchaseRequestDto(updated);
  },

  /** Mark an APPROVED request as ORDERED (route-gated by purchase_request:mark_ordered). */
  async markOrdered(
    id: string,
    tenantId: string,
    actor: ApprovalActor,
    orderNote?: string | null,
  ): Promise<PurchaseRequestDto> {
    const request = await purchaseRequestRepository.findById(id, tenantId);
    if (!request) {
      throw new NotFoundError('Purchase request not found');
    }
    if (request.status !== 'APPROVED') {
      throw new BadRequestError('Only approved requests can be marked as ordered', 'PURCHASE_NOT_APPROVED');
    }
    const updated = await purchaseRequestRepository.update(id, tenantId, {
      status: 'ORDERED',
      orderedAt: new Date(),
      orderNote: orderNote ?? null,
      ...(actor.employeeId && { orderedBy: { connect: { id: actor.employeeId } } }),
    });
    return toPurchaseRequestDto(updated);
  },
};

/** Load a request the caller owns and that still accepts attachment changes.
    The owner can add/remove quotes/contracts while the request is "active" —
    every status except the terminal REJECTED/CANCELLED. This covers PENDING and
    RETURNED, but also APPROVED/ORDERED so a request that was approved (e.g. an
    admin's self-approved request) can still receive its supporting documents. */
async function requireAttachableOwnRequest(id: string, tenantId: string, ownerEmployeeId: string) {
  const request = await purchaseRequestRepository.findById(id, tenantId);
  if (!request) {
    throw new NotFoundError('Purchase request not found');
  }
  if (request.employeeId !== ownerEmployeeId) {
    throw new ForbiddenError('You can only modify your own purchase requests');
  }
  if (request.status === 'REJECTED' || request.status === 'CANCELLED') {
    throw new BadRequestError(
      'Attachments cannot be changed on a rejected or cancelled request',
      'PURCHASE_NOT_EDITABLE',
    );
  }
  return request;
}

type RequestWithApprovals = NonNullable<
  Awaited<ReturnType<typeof purchaseRequestRepository.findByIdWithApprovals>>
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
 * A ROLE step the *submitter themselves* satisfies (Founder = super_admin) is
 * auto-skipped — the Founder never approves their own request.
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
 * engine; the defensive flowId=null case falls back to a one-shot decision. A
 * reviewer can never act on their own request.
 */
async function decide(
  id: string,
  tenantId: string,
  actor: ApprovalActor,
  intent: 'APPROVED' | 'RETURNED' | 'REJECTED',
  note?: string,
): Promise<PurchaseRequestDto> {
  const request = await purchaseRequestRepository.findByIdWithApprovals(id, tenantId);
  if (!request) {
    throw new NotFoundError('Purchase request not found');
  }
  if (request.status !== 'PENDING') {
    throw new BadRequestError('Only pending requests can be reviewed', 'PURCHASE_NOT_PENDING');
  }
  if (actor.employeeId && request.employeeId === actor.employeeId) {
    throw new ForbiddenError('You cannot review your own purchase request', 'PURCHASE_SELF_REVIEW');
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
): Promise<PurchaseRequestDto> {
  if (intent !== 'APPROVED' && (!note || !note.trim())) {
    throw new BadRequestError('A note is required', 'PURCHASE_NOTE_REQUIRED');
  }
  const updated = await purchaseRequestRepository.update(request.id, tenantId, {
    status: intent,
    ...(actor.employeeId && { reviewedBy: { connect: { id: actor.employeeId } } }),
    reviewedAt: new Date(),
    reviewNote: note ?? intent,
  });
  return toPurchaseRequestDto(updated);
}

/** Approve the current step; advance to the next active step or finalize APPROVED. */
async function approveStep(
  request: RequestWithApprovals,
  tenantId: string,
  actor: ApprovalActor,
): Promise<PurchaseRequestDto> {
  const round = currentRound(request.approvals);
  const inRound = request.approvals.filter((a) => a.round === round);
  const current = inRound.find((a) => a.stepOrder === request.currentStep && a.decision === null);
  if (!current) {
    throw new BadRequestError('No pending approval step to act on', 'PURCHASE_INVALID_STEP');
  }
  if (!matchesApprover(current, actor)) {
    throw new ForbiddenError('You are not the approver for the current step', 'PURCHASE_NOT_CURRENT_APPROVER');
  }

  const now = new Date();
  const next = inRound
    .filter((a) => a.stepOrder > request.currentStep && a.decision === null)
    .sort((a, b) => a.stepOrder - b.stepOrder)[0];
  const lastStepOrder = inRound.reduce((max, a) => Math.max(max, a.stepOrder), 0);

  const requestData: Prisma.PurchaseRequestUpdateInput = next
    ? { currentStep: next.stepOrder }
    : {
        status: 'APPROVED',
        currentStep: lastStepOrder + 1,
        ...(actor.employeeId && { reviewedBy: { connect: { id: actor.employeeId } } }),
        reviewedAt: now,
        reviewNote: 'APPROVED',
      };

  const updated = await purchaseRequestRepository.recordDecision(
    current.id,
    { decision: 'APPROVED', decidedById: actor.employeeId, decidedAt: now, note: null },
    request.id,
    tenantId,
    requestData,
  );
  return toPurchaseRequestDto(updated);
}

/** Return (RETURNED, resubmittable) or reject (REJECTED, terminal) the current step. */
async function returnOrRejectStep(
  request: RequestWithApprovals,
  tenantId: string,
  actor: ApprovalActor,
  intent: 'RETURNED' | 'REJECTED',
  note?: string,
): Promise<PurchaseRequestDto> {
  const round = currentRound(request.approvals);
  const current = request.approvals.find(
    (a) => a.round === round && a.stepOrder === request.currentStep && a.decision === null,
  );
  if (!current) {
    throw new BadRequestError('No pending approval step to act on', 'PURCHASE_INVALID_STEP');
  }
  if (!matchesApprover(current, actor)) {
    throw new ForbiddenError('You are not the approver for the current step', 'PURCHASE_NOT_CURRENT_APPROVER');
  }
  if (!note || !note.trim()) {
    throw new BadRequestError('A note is required', 'PURCHASE_NOTE_REQUIRED');
  }

  const now = new Date();
  const updated = await purchaseRequestRepository.recordDecision(
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
  return toPurchaseRequestDto(updated);
}

/** Header/line validation (defence-in-depth alongside the Zod schema). */
function validateInput(input: { title: string; vendorName: string; items: PurchaseItemInput[] }) {
  if (!input.title?.trim()) {
    throw new BadRequestError('Title is required', 'PURCHASE_TITLE_REQUIRED');
  }
  if (!input.vendorName?.trim()) {
    throw new BadRequestError('Vendor name is required', 'PURCHASE_VENDOR_REQUIRED');
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new BadRequestError('At least one line item is required', 'PURCHASE_NO_ITEMS');
  }
  for (const it of input.items) {
    if (!it.productName?.trim()) {
      throw new BadRequestError('Product name is required for every line', 'PURCHASE_ITEM_NAME_REQUIRED');
    }
    if (!(Number(it.quantity) > 0)) {
      throw new BadRequestError('Quantity must be greater than 0', 'PURCHASE_ITEM_INVALID_QUANTITY');
    }
    if (!(Number(it.unitPrice) >= 0)) {
      throw new BadRequestError('Unit price must be 0 or greater', 'PURCHASE_ITEM_INVALID_PRICE');
    }
    const rate = it.taxRate ?? 8;
    if (rate < 0 || rate > 100) {
      throw new BadRequestError('Tax rate must be between 0 and 100', 'PURCHASE_ITEM_INVALID_TAX');
    }
  }
}

/** The six snapshot columns copied onto a PurchaseRequest for the PO header. */
interface IssuingSnapshot {
  issuingEntityId: string | null;
  issuingCompanyName: string | null;
  issuingAddress: string | null;
  issuingTaxCode: string | null;
  issuingPhone: string | null;
  issuingLogoUrl: string | null;
}

const EMPTY_ISSUING_SNAPSHOT: IssuingSnapshot = {
  issuingEntityId: null,
  issuingCompanyName: null,
  issuingAddress: null,
  issuingTaxCode: null,
  issuingPhone: null,
  issuingLogoUrl: null,
};

/** The issuingEntity relation patch for an UPDATE: connect a chosen entity or
 *  disconnect when none is selected (clears the FK). */
function issuingRelationUpdate(
  issuing: IssuingSnapshot,
): Pick<Prisma.PurchaseRequestUpdateInput, 'issuingEntity'> {
  return issuing.issuingEntityId
    ? { issuingEntity: { connect: { id: issuing.issuingEntityId } } }
    : { issuingEntity: { disconnect: true } };
}

/**
 * SPEC-043: resolve `issuingEntityId` (tenant-scoped) into a full snapshot of the
 * entity's identity. The snapshot is frozen onto the request so later edits/hides
 * of the entity never change a printed PDF.
 *
 * - No id given → empty snapshot (PDF falls back to settings.company).
 * - id of another tenant / unknown → BadRequest (never trust a foreign id).
 * - On create, the entity must be active; on update/resubmit we still snapshot an
 *   inactive entity so an owner editing an existing draft keeps its chosen issuer.
 */
async function resolveIssuingSnapshot(
  tenantId: string,
  issuingEntityId: string | null | undefined,
  opts: { requireActive: boolean },
): Promise<IssuingSnapshot> {
  if (!issuingEntityId) return { ...EMPTY_ISSUING_SNAPSHOT };

  const entity = await issuingEntityRepository.findById(issuingEntityId, tenantId);
  if (!entity) {
    throw new BadRequestError('Pháp nhân phát hành không hợp lệ', 'PURCHASE_INVALID_ISSUING_ENTITY');
  }
  if (opts.requireActive && !entity.active) {
    throw new BadRequestError('Pháp nhân phát hành đã bị ẩn', 'PURCHASE_ISSUING_ENTITY_INACTIVE');
  }
  return {
    issuingEntityId: entity.id,
    issuingCompanyName: entity.name,
    issuingAddress: entity.address,
    issuingTaxCode: entity.taxCode,
    issuingPhone: entity.phone,
    issuingLogoUrl: entity.logoUrl,
  };
}

async function resolveFlowSnapshot(tenantId: string, employeeId: string) {
  const routingCtx = await employeeRepository.findRoutingContext(employeeId, tenantId);
  const flows = await approvalFlowRepository.findAll(tenantId, ApprovalFlowType.PURCHASE);
  const flow = resolveFlow(flows.map(toFlowCandidate), routingCtx?.departmentId ?? null);
  if (!flow) return null;

  const snapshot = buildApprovalSnapshot(flow, {
    requesterId: employeeId,
    directManagerId: routingCtx?.managerId ?? null,
    departmentHeadId: routingCtx?.departmentHeadId ?? null,
  });
  return { flowId: flow.id, snapshot };
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

// ── Pure helpers (exported for unit testing) ──────────────────────────────────

/**
 * Round to 2dp (currency precision). Scales to cents and nudges by a relative
 * epsilon so values that should land on the .xx5 boundary but are stored a hair
 * below it (e.g. 1.333 × 12345 = 16455.885 → 16455.884999…) still round half-up
 * deterministically rather than truncating down.
 */
function round2(n: number): number {
  const scaled = n * 100;
  return Math.round(scaled + Math.sign(scaled) * 1e-6) / 100;
}

/** Round to 2dp and stringify — used by the stats aggregator. */
function money(n: number): string {
  return round2(n).toString();
}

export interface ComputedLine {
  lineNo: number;
  sku: string | null;
  productName: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
}

export interface ComputedTotals {
  lines: ComputedLine[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}

/**
 * Recompute every line's money fields and the request totals from raw item input.
 * The server never trusts client-sent totals. Per the spec:
 *   lineSubtotal = round2(quantity × unitPrice)
 *   lineTax      = round2(lineSubtotal × taxRate / 100)
 *   lineTotal    = lineSubtotal + lineTax
 *   subtotal = Σ lineSubtotal · taxAmount = Σ lineTax · totalAmount = subtotal + taxAmount
 */
export function computeTotals(items: PurchaseItemInput[]): ComputedTotals {
  const lines: ComputedLine[] = items.map((it, idx) => {
    const quantity = Number(it.quantity);
    const unitPrice = Number(it.unitPrice);
    const taxRate = it.taxRate ?? 8;
    const lineSubtotal = round2(quantity * unitPrice);
    const lineTax = round2((lineSubtotal * taxRate) / 100);
    const lineTotal = round2(lineSubtotal + lineTax);
    return {
      lineNo: idx + 1,
      sku: it.sku?.trim() ? it.sku.trim() : null,
      productName: it.productName.trim(),
      unit: it.unit?.trim() ? it.unit.trim() : null,
      quantity,
      unitPrice,
      taxRate,
      lineSubtotal,
      lineTax,
      lineTotal,
    };
  });

  const subtotal = round2(lines.reduce((s, l) => s + l.lineSubtotal, 0));
  const taxAmount = round2(lines.reduce((s, l) => s + l.lineTax, 0));
  const totalAmount = round2(subtotal + taxAmount);
  return { lines, subtotal, taxAmount, totalAmount };
}

/** Map a computed line to a Prisma createMany row (Decimals as strings). */
function lineToCreate(l: ComputedLine): Omit<Prisma.PurchaseRequestItemCreateManyInput, 'requestId'> {
  return {
    lineNo: l.lineNo,
    sku: l.sku,
    productName: l.productName,
    unit: l.unit,
    quantity: new Prisma.Decimal(l.quantity),
    unitPrice: new Prisma.Decimal(l.unitPrice),
    taxRate: new Prisma.Decimal(l.taxRate),
    lineSubtotal: new Prisma.Decimal(l.lineSubtotal),
    lineTax: new Prisma.Decimal(l.lineTax),
    lineTotal: new Prisma.Decimal(l.lineTotal),
  };
}

/** Build a code `PR-yyyyMMdd-NNN` from a creation date + the count of same-day requests. */
export function generatePurchaseCode(createdAt: Date, sameDayCount: number): string {
  const y = createdAt.getUTCFullYear();
  const m = String(createdAt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(createdAt.getUTCDate()).padStart(2, '0');
  const seq = String(sameDayCount + 1).padStart(3, '0');
  return `PR-${y}${m}${d}-${seq}`;
}

/** UTC day bounds for a date — used to count same-day requests for the sequence. */
function dayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
  return { start, end };
}

/**
 * Create a request with a freshly-generated daily code, retrying on the rare
 * unique (tenantId, code) collision by bumping the sequence.
 */
async function createWithGeneratedCode<T>(
  tenantId: string,
  create: (code: string) => Promise<T>,
): Promise<T> {
  const now = new Date();
  const { start, end } = dayBounds(now);
  let baseCount = await purchaseRequestRepository.countTodayForTenant(tenantId, start, end);

  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt += 1) {
    const code = generatePurchaseCode(now, baseCount + attempt);
    try {
      return await create(code);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        attempt < MAX_CODE_RETRIES - 1
      ) {
        // Collision on (tenantId, code) — recount and retry with a bumped sequence.
        baseCount = await purchaseRequestRepository.countTodayForTenant(tenantId, start, end);
        continue;
      }
      throw err;
    }
  }
  throw new BadRequestError('Could not generate a unique purchase code', 'PURCHASE_CODE_COLLISION');
}

/**
 * Pure aggregation for company-wide yearly stats — exported for unit testing.
 * Buckets rows by month of `createdAt`, totals by status, and ranks departments
 * and vendors by spend (desc). Uses `totalAmount` (VAT-inclusive).
 */
export function aggregatePurchaseStats(
  rows: {
    createdAt: Date;
    totalAmount: Prisma.Decimal | number | string;
    status: string;
    departmentName: string | null;
    vendorName: string | null;
  }[],
  year: number,
): PurchaseStatsResponse {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, _total: 0, count: 0 }));
  const byStatus = new Map<string, { total: number; count: number }>();
  const byDepartment = new Map<string, { total: number; count: number }>();
  const byVendor = new Map<string, { total: number; count: number }>();
  let grandTotal = 0;
  let orderedTotal = 0;
  let pendingTotal = 0;

  const bump = (map: Map<string, { total: number; count: number }>, key: string, amt: number) => {
    const cur = map.get(key) ?? { total: 0, count: 0 };
    cur.total += amt;
    cur.count += 1;
    map.set(key, cur);
  };

  for (const r of rows) {
    const amt = Number(r.totalAmount);
    const m = r.createdAt.getUTCMonth(); // 0–11
    months[m]._total += amt;
    months[m].count += 1;
    grandTotal += amt;
    if (r.status === 'ORDERED') orderedTotal += amt;
    if (r.status === 'PENDING') pendingTotal += amt;

    bump(byStatus, r.status, amt);
    bump(byDepartment, r.departmentName?.trim() || '—', amt);
    bump(byVendor, r.vendorName?.trim() || '—', amt);
  }

  const toGroups = (map: Map<string, { total: number; count: number }>, sort: boolean) => {
    const groups = [...map.entries()].map(([key, v]) => ({ key, total: money(v.total), count: v.count }));
    if (sort) groups.sort((a, b) => Number(b.total) - Number(a.total));
    return groups;
  };

  return {
    year,
    months: months.map((mo) => ({ month: mo.month, total: money(mo._total), count: mo.count })),
    byStatus: toGroups(byStatus, false),
    byDepartment: toGroups(byDepartment, true),
    byVendor: toGroups(byVendor, true),
    grandTotal: money(grandTotal),
    grandCount: rows.length,
    orderedTotal: money(orderedTotal),
    pendingTotal: money(pendingTotal),
  };
}
