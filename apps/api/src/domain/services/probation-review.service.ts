import { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';
import {
  probationReviewRepository,
  type ProbationReviewFilters,
} from '../repositories/probation-review.repository.js';
import { probationCriteriaRepository } from '../repositories/probation-criteria.repository.js';
import { employeeRepository } from '../repositories/employee.repository.js';
import { notificationRepository } from '../repositories/notification.repository.js';
import { contractService } from './contract.service.js';
import { employeeService } from './employee.service.js';
import { toProbationReviewDto, toProbationSelfReviewDto } from '../probation/mappers.js';
import { logger } from '../../shared/utils/logger.js';
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
  ForbiddenError,
} from '../../shared/errors/index.js';
import type {
  ProbationReviewDto,
  ProbationReviewListParams,
  PatchProbationReviewInput,
  SubmitProbationReviewInput,
  DecideProbationReviewInput,
  ProbationSelfReviewDto,
  PatchProbationSelfInput,
  SubmitProbationSelfInput,
  ProbationRatings,
} from '@hrm/shared';

export interface ProbationReviewListResult {
  data: ProbationReviewDto[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const probationReviewService = {
  // employeeIds = restrict to these ids (MANAGER scope), or null for tenant-wide (HR).
  async list(
    tenantId: string,
    employeeIds: string[] | null,
    params: ProbationReviewListParams,
  ): Promise<ProbationReviewListResult> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 20;

    // A scoped reviewer with no reports can never match anything — short-circuit.
    if (employeeIds && employeeIds.length === 0) {
      return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }

    const filters: ProbationReviewFilters = {
      status: params.status,
      employeeId: params.employeeId,
      employeeIds,
      page,
      limit,
    };
    const { rows, total } = await probationReviewRepository.list(tenantId, filters);

    return {
      data: rows.map(toProbationReviewDto),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async getById(tenantId: string, id: string): Promise<ProbationReviewDto> {
    const review = await probationReviewRepository.findById(id, tenantId);
    if (!review) {
      throw new NotFoundError('Probation review not found');
    }
    return toProbationReviewDto(review);
  },

  // ===== SPEC-033: Self Evaluation (Step 1) =====

  // Review mở của CHÍNH user gọi — mọi self endpoint đi qua resolve này nên không
  // bao giờ trả review của người khác. 404 cả khi user không còn thử việc.
  async getMine(tenantId: string, userId: string): Promise<ProbationSelfReviewDto> {
    const employee = await employeeRepository.findByUserId(userId, tenantId);
    if (!employee || employee.contractType !== 'PROBATION') {
      throw new NotFoundError('No open probation review');
    }
    const review = await probationReviewRepository.findOpenForEmployee(employee.id, tenantId);
    if (!review) {
      throw new NotFoundError('No open probation review');
    }
    const criteria = await probationCriteriaRepository.findAll(tenantId, { activeOnly: true });
    return toProbationSelfReviewDto(review, criteria);
  },

  // Gate chung cho patch/submit self: đúng chủ thể + còn sửa được (DRAFT, chưa nộp self).
  async requireOwnEditableSelf(tenantId: string, id: string, userId: string) {
    const review = await probationReviewRepository.findById(id, tenantId);
    if (!review) {
      throw new NotFoundError('Probation review not found');
    }
    const employee = await employeeRepository.findByUserId(userId, tenantId);
    if (!employee || review.employeeId !== employee.id) {
      throw new ForbiddenError('You may only edit your own self evaluation');
    }
    if (review.status !== 'DRAFT' || review.selfSubmittedAt) {
      throw new ConflictError(
        'Self evaluation can no longer be edited',
        'PROBATION_SELF_NOT_EDITABLE',
      );
    }
    return review;
  },

  async patchSelf(
    tenantId: string,
    id: string,
    userId: string,
    input: PatchProbationSelfInput,
  ): Promise<ProbationSelfReviewDto> {
    await this.requireOwnEditableSelf(tenantId, id, userId);

    const data: Prisma.ProbationReviewUpdateManyMutationInput = {};
    if (input.selfRatings !== undefined) {
      data.selfRatings = input.selfRatings as Prisma.InputJsonValue;
    }
    if (input.selfComment !== undefined) data.selfComment = input.selfComment;

    // Guard nguyên tử: manager có thể submit giữa check và write — count=0 là cửa đã đóng.
    const count = await probationReviewRepository.updateSelfIfEditable(id, tenantId, data);
    if (count === 0) {
      throw new ConflictError(
        'Self evaluation can no longer be edited',
        'PROBATION_SELF_NOT_EDITABLE',
      );
    }

    const updated = await probationReviewRepository.findById(id, tenantId);
    const criteria = await probationCriteriaRepository.findAll(tenantId, { activeOnly: true });
    return toProbationSelfReviewDto(updated!, criteria);
  },

  // Nộp self: đủ tiêu chí active, khóa vĩnh viễn (mirror rule submit của manager).
  async submitSelf(
    tenantId: string,
    id: string,
    userId: string,
    input: SubmitProbationSelfInput,
  ): Promise<ProbationSelfReviewDto> {
    await this.requireOwnEditableSelf(tenantId, id, userId);

    const activeCriteria = await probationCriteriaRepository.findAll(tenantId, {
      activeOnly: true,
    });
    const activeIds = activeCriteria.map((c) => c.id);
    const missing = activeIds.filter((cid) => typeof input.selfRatings[cid] !== 'number');
    if (activeIds.length === 0 || missing.length > 0) {
      throw new BadRequestError(
        'All active criteria must be self-scored before submitting',
        'PROBATION_SELF_INCOMPLETE',
      );
    }

    // Chỉ giữ điểm của tiêu chí active — bỏ key lạ trước khi chốt.
    const selfRatings: ProbationRatings = {};
    for (const cid of activeIds) {
      selfRatings[cid] = input.selfRatings[cid];
    }

    // Guard nguyên tử như patchSelf — nộp self sau khi manager đã submit là vô hiệu.
    const count = await probationReviewRepository.updateSelfIfEditable(id, tenantId, {
      selfRatings: selfRatings as Prisma.InputJsonValue,
      selfComment: input.selfComment ?? null,
      selfSubmittedAt: new Date(),
    });
    if (count === 0) {
      throw new ConflictError(
        'Self evaluation can no longer be edited',
        'PROBATION_SELF_NOT_EDITABLE',
      );
    }

    const updated = await probationReviewRepository.findById(id, tenantId);
    return toProbationSelfReviewDto(updated!, activeCriteria);
  },

  // Open a fresh DRAFT scorecard. The caller (controller) has already verified the
  // reviewer is allowed to evaluate this employee (HR-all or direct manager).
  async createDraft(
    tenantId: string,
    employeeId: string,
    reviewerEmployeeId: string | null,
  ): Promise<ProbationReviewDto> {
    const employee = await employeeRepository.findById(employeeId, tenantId);
    if (!employee) {
      throw new NotFoundError('Employee not found');
    }
    if (employee.contractType !== 'PROBATION') {
      throw new BadRequestError(
        'Employee is not on probation',
        'PROBATION_EMPLOYEE_NOT_ON_PROBATION',
      );
    }

    const open = await probationReviewRepository.findOpenForEmployee(employeeId, tenantId);
    if (open) {
      throw new ConflictError(
        'An open probation review already exists for this employee',
        'PROBATION_REVIEW_OPEN_EXISTS',
      );
    }

    const created = await probationReviewRepository.create({
      tenant: { connect: { id: tenantId } },
      employee: { connect: { id: employeeId } },
      reviewer: reviewerEmployeeId ? { connect: { id: reviewerEmployeeId } } : undefined,
      status: 'DRAFT',
      probationEndDateAtCreate: employee.probationEndDate ?? null,
    });

    // SPEC-033 Step 1: báo NV chủ thể vào hoàn thành tự đánh giá (deep-link /probation/me).
    // Best-effort: notification fail không được làm hỏng review vừa tạo (nếu throw,
    // retry của manager sẽ chết ở check 1-open-review và NV mất thông báo vĩnh viễn).
    if (employee.userId) {
      try {
        await notificationRepository.create({
          tenantId,
          userId: employee.userId,
          kind: 'probation_self_requested',
          title: 'Bạn có bản tự đánh giá thử việc',
          body: 'Quản lý đã mở kỳ đánh giá thử việc của bạn. Hãy hoàn thành phần tự đánh giá trước khi quản lý chấm điểm.',
          entityType: 'probation_review',
          entityId: created.id,
          dedupeKey: `probation_self_requested:${created.id}`,
        });
      } catch (error) {
        logger.error(
          { err: error, event: 'probation.self_notification_failed', reviewId: created.id },
          'Failed to create probation self-evaluation notification',
        );
      }
    }

    return toProbationReviewDto(created);
  },

  // Manager saves scorecard progress. Only a DRAFT is editable (immutable after submit).
  async patch(
    tenantId: string,
    id: string,
    input: PatchProbationReviewInput,
  ): Promise<ProbationReviewDto> {
    await this.requireEditableDraft(tenantId, id);

    const data: Prisma.ProbationReviewUpdateInput = {};
    if (input.ratings !== undefined) {
      data.ratings = input.ratings as Prisma.InputJsonValue;
    }
    if (input.deliverables !== undefined) {
      data.deliverables = input.deliverables as unknown as Prisma.InputJsonValue;
    }
    if (input.strengths !== undefined) data.strengths = input.strengths;
    if (input.weaknesses !== undefined) data.weaknesses = input.weaknesses;
    if (input.comment !== undefined) data.comment = input.comment;
    if (input.recommendation !== undefined) data.recommendation = input.recommendation;
    if (input.newProbationEndDate !== undefined) {
      data.newProbationEndDate = input.newProbationEndDate
        ? new Date(input.newProbationEndDate)
        : null;
    }

    const updated = await probationReviewRepository.update(id, tenantId, data);
    return toProbationReviewDto(updated);
  },

  // Manager submits the scorecard → PENDING_HR. Validates completeness; locks edits.
  async submit(
    tenantId: string,
    id: string,
    input: SubmitProbationReviewInput,
  ): Promise<ProbationReviewDto> {
    await this.requireEditableDraft(tenantId, id);

    // Every active criterion must be scored (inactive ones are optional/ignored).
    const activeCriteria = await probationCriteriaRepository.findAll(tenantId, {
      activeOnly: true,
    });
    const activeIds = activeCriteria.map((c) => c.id);
    const missing = activeIds.filter((cid) => typeof input.ratings[cid] !== 'number');
    if (activeIds.length === 0 || missing.length > 0) {
      throw new BadRequestError(
        'All active criteria must be scored before submitting',
        'PROBATION_INCOMPLETE_SCORECARD',
      );
    }

    // EXTEND must propose a probation end date in the future.
    let newProbationEndDate: Date | null = null;
    if (input.recommendation === 'EXTEND') {
      const proposed = input.newProbationEndDate ? new Date(input.newProbationEndDate) : null;
      if (!proposed || proposed.getTime() <= Date.now()) {
        throw new BadRequestError(
          'Extending probation requires a future end date',
          'PROBATION_EXTEND_DATE_REQUIRED',
        );
      }
      newProbationEndDate = proposed;
    }

    // Persist only active-criteria scores to keep the scorecard clean.
    const ratings: ProbationRatings = {};
    for (const cid of activeIds) {
      ratings[cid] = input.ratings[cid];
    }

    const updated = await probationReviewRepository.update(id, tenantId, {
      status: 'PENDING_HR',
      submittedAt: new Date(),
      ratings: ratings as Prisma.InputJsonValue,
      recommendation: input.recommendation,
      strengths: input.strengths ?? null,
      weaknesses: input.weaknesses ?? null,
      comment: input.comment ?? null,
      newProbationEndDate,
      // SPEC-031: deliverables nộp kèm sẽ chốt cùng scorecard; bỏ qua nếu không gửi
      // (giữ nguyên các mục đã lưu nháp trước đó).
      ...(input.deliverables !== undefined
        ? { deliverables: input.deliverables as unknown as Prisma.InputJsonValue }
        : {}),
    });
    return toProbationReviewDto(updated);
  },

  // HR final decision. The status flip and its consequence (new contract /
  // extended date / termination) run in ONE transaction so they cannot diverge.
  async decide(
    tenantId: string,
    id: string,
    reviewerEmployeeId: string | null,
    input: DecideProbationReviewInput,
  ): Promise<ProbationReviewDto> {
    const review = await probationReviewRepository.findById(id, tenantId);
    if (!review) {
      throw new NotFoundError('Probation review not found');
    }
    if (review.status !== 'PENDING_HR') {
      throw new ConflictError(
        'Only a submitted review awaiting HR can be decided',
        'PROBATION_REVIEW_NOT_DECIDABLE',
      );
    }

    const employeeId = review.employeeId;

    // Validate consequence-specific inputs before opening the transaction.
    let newProbationEndDate: Date | null = null;
    if (input.decision === 'EXTEND') {
      const proposed = input.newProbationEndDate ? new Date(input.newProbationEndDate) : null;
      if (!proposed || proposed.getTime() <= Date.now()) {
        throw new BadRequestError(
          'Extending probation requires a future end date',
          'PROBATION_EXTEND_DATE_REQUIRED',
        );
      }
      newProbationEndDate = proposed;
    }
    if (input.decision === 'FAIL' && !input.decisionNote) {
      throw new BadRequestError(
        'Failing probation requires a reason',
        'PROBATION_FAIL_REASON_REQUIRED',
      );
    }

    await db.$transaction(async (tx) => {
      if (input.decision === 'CONFIRM') {
        await contractService.createWithinTx(tx, employeeId, tenantId, {
          type: 'FULL_TIME',
          startDate: new Date().toISOString(),
          status: 'ACTIVE',
        });
        await tx.employee.update({
          where: { id: employeeId, tenantId },
          data: { contractType: 'FULL_TIME' },
        });
      } else if (input.decision === 'EXTEND') {
        await tx.employee.update({
          where: { id: employeeId, tenantId },
          data: { probationEndDate: newProbationEndDate },
        });
      } else {
        await employeeService.terminateWithinTx(tx, employeeId, tenantId, input.decisionNote);
      }

      await tx.probationReview.update({
        where: { id, tenantId },
        data: {
          status: 'DECIDED',
          decision: input.decision,
          decisionNote: input.decisionNote ?? null,
          decidedAt: new Date(),
          newProbationEndDate,
          decidedBy: reviewerEmployeeId ? { connect: { id: reviewerEmployeeId } } : undefined,
        },
      });
    });

    return this.getById(tenantId, id);
  },

  // Withdraw an open (non-terminal) review. Decided/cancelled reviews are immutable.
  async cancel(tenantId: string, id: string): Promise<ProbationReviewDto> {
    const review = await probationReviewRepository.findById(id, tenantId);
    if (!review) {
      throw new NotFoundError('Probation review not found');
    }
    if (review.status === 'DECIDED' || review.status === 'CANCELLED') {
      throw new ConflictError(
        'This review can no longer be cancelled',
        'PROBATION_REVIEW_NOT_CANCELLABLE',
      );
    }

    const updated = await probationReviewRepository.update(id, tenantId, {
      status: 'CANCELLED',
    });
    return toProbationReviewDto(updated);
  },

  // Shared guard: the review exists and is still a DRAFT (the only editable state).
  async requireEditableDraft(tenantId: string, id: string) {
    const review = await probationReviewRepository.findById(id, tenantId);
    if (!review) {
      throw new NotFoundError('Probation review not found');
    }
    if (review.status !== 'DRAFT') {
      throw new ConflictError(
        'Only a draft review can be edited',
        'PROBATION_REVIEW_NOT_EDITABLE',
      );
    }
    return review;
  },
};
