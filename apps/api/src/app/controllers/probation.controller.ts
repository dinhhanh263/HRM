import type { Request, Response } from 'express';
import { probationCriteriaService } from '../../domain/services/probation-criteria.service.js';
import { probationReviewService } from '../../domain/services/probation-review.service.js';
import { probationGuidelineService } from '../../domain/services/probation-guideline.service.js';
import { employeeRepository } from '../../domain/repositories/employee.repository.js';
import { permissionService } from '../../domain/services/permission.service.js';
import { ForbiddenError, ValidationError } from '../../shared/errors/index.js';
import {
  listProbationCriteriaQuerySchema,
  listProbationGuidelineQuerySchema,
  createProbationReviewSchema,
  listProbationReviewQuerySchema,
  patchProbationReviewSchema,
  submitProbationReviewSchema,
  patchProbationSelfSchema,
  submitProbationSelfSchema,
  decideReviewSchema,
} from '../validators/probation.validator.js';

/**
 * Tenant-wide probation visibility (HR scope). SUPER_ADMIN is implicit-all;
 * otherwise only roles granted `probation:decide` (HR) may see/act on every
 * employee's review. Managers fall back to their direct reports.
 */
async function canViewAllProbation(req: Request): Promise<boolean> {
  const user = req.user!;
  if (user.role === 'SUPER_ADMIN') {
    return true;
  }
  if (!user.roleId) {
    return false;
  }
  const granted = await permissionService.getPermissionsForRole(user.roleId);
  return granted.has('probation:decide');
}

/** Resolve the authenticated reviewer's direct-report employee ids. */
async function resolveReportIds(req: Request, tenantId: string): Promise<string[]> {
  const reviewer = await employeeRepository.findByUserId(req.user!.sub, tenantId);
  if (!reviewer) {
    return [];
  }
  return employeeRepository.findReportIds(reviewer.id, tenantId);
}

/**
 * Load a review (404 if absent) and assert the caller may act on it: HR sees every
 * review; a manager only their direct reports' (403 otherwise).
 */
async function assertReviewInScope(req: Request, tenantId: string, reviewId: string) {
  const review = await probationReviewService.getById(tenantId, reviewId);
  if (!(await canViewAllProbation(req))) {
    const reportIds = await resolveReportIds(req, tenantId);
    if (!reportIds.includes(review.employee.id)) {
      throw new ForbiddenError('You may only act on reviews for your team');
    }
  }
  return review;
}

export const probationController = {
  // ---- Criteria ----
  async listCriteria(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const { activeOnly } = listProbationCriteriaQuerySchema.parse(req.query);

    const data = await probationCriteriaService.getAll(tenantId, { activeOnly });

    res.json({ success: true, data });
  },

  async createCriteria(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const criteria = await probationCriteriaService.create(tenantId, req.body);

    res.status(201).json({ success: true, data: criteria });
  },

  async updateCriteria(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const criteria = await probationCriteriaService.update(req.params.id, tenantId, req.body);

    res.json({ success: true, data: criteria });
  },

  async deleteCriteria(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    await probationCriteriaService.remove(req.params.id, tenantId);

    res.status(204).send();
  },

  // ---- Guidelines (SPEC-032) ----
  async listGuidelines(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    // safeParse: query sai (vd ?year=abc) là lỗi client (422), không phải 500.
    const parsed = listProbationGuidelineQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const data = await probationGuidelineService.getAll(tenantId, {
      year: parsed.data.year,
      language: parsed.data.language,
    });

    res.json({ success: true, data });
  },

  async createGuideline(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const guideline = await probationGuidelineService.create(tenantId, req.body);

    res.status(201).json({ success: true, data: guideline });
  },

  async updateGuideline(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const guideline = await probationGuidelineService.update(req.params.id, tenantId, req.body);

    res.json({ success: true, data: guideline });
  },

  async deleteGuideline(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    await probationGuidelineService.remove(req.params.id, tenantId);

    res.status(204).send();
  },

  // ---- Self Evaluation (SPEC-033) ---- ownership enforce trong service (userId).
  async getMyReview(req: Request, res: Response) {
    const data = await probationReviewService.getMine(req.user!.tenantId, req.user!.sub);
    res.json({ success: true, data });
  },

  async patchSelf(req: Request, res: Response) {
    const input = patchProbationSelfSchema.parse(req.body);
    const data = await probationReviewService.patchSelf(
      req.user!.tenantId,
      req.params.id,
      req.user!.sub,
      input,
    );
    res.json({ success: true, data });
  },

  async submitSelf(req: Request, res: Response) {
    const input = submitProbationSelfSchema.parse(req.body);
    const data = await probationReviewService.submitSelf(
      req.user!.tenantId,
      req.params.id,
      req.user!.sub,
      input,
    );
    res.json({ success: true, data });
  },

  // ---- Reviews ----
  async listReviews(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const params = listProbationReviewQuerySchema.parse(req.query);

    // HR (probation:decide) sees the whole tenant; a manager only their reports.
    const employeeIds = (await canViewAllProbation(req))
      ? null
      : await resolveReportIds(req, tenantId);

    const { data, pagination } = await probationReviewService.list(tenantId, employeeIds, params);

    res.json({ success: true, data, pagination });
  },

  async getReview(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const review = await probationReviewService.getById(tenantId, req.params.id);

    if (!(await canViewAllProbation(req))) {
      const reportIds = await resolveReportIds(req, tenantId);
      if (!reportIds.includes(review.employee.id)) {
        throw new ForbiddenError('You may only view reviews for your team');
      }
    }

    res.json({ success: true, data: review });
  },

  async createReview(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const { employeeId } = createProbationReviewSchema.parse(req.body);

    const reviewer = await employeeRepository.findByUserId(req.user!.sub, tenantId);

    // A manager may only open reviews for their direct reports; HR may open for anyone.
    if (!(await canViewAllProbation(req))) {
      const reportIds = await resolveReportIds(req, tenantId);
      if (!reportIds.includes(employeeId)) {
        throw new ForbiddenError('You may only open reviews for your team');
      }
    }

    const data = await probationReviewService.createDraft(tenantId, employeeId, reviewer?.id ?? null);

    res.status(201).json({ success: true, data });
  },

  async patchReview(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const input = patchProbationReviewSchema.parse(req.body);

    await assertReviewInScope(req, tenantId, req.params.id);
    const data = await probationReviewService.patch(tenantId, req.params.id, input);

    res.json({ success: true, data });
  },

  async submitReview(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const input = submitProbationReviewSchema.parse(req.body);

    await assertReviewInScope(req, tenantId, req.params.id);
    const data = await probationReviewService.submit(tenantId, req.params.id, input);

    res.json({ success: true, data });
  },

  async decideReview(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const input = decideReviewSchema.parse(req.body);

    await assertReviewInScope(req, tenantId, req.params.id);
    const decider = await employeeRepository.findByUserId(req.user!.sub, tenantId);
    const data = await probationReviewService.decide(
      tenantId,
      req.params.id,
      decider?.id ?? null,
      input,
    );

    res.json({ success: true, data });
  },

  async cancelReview(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;

    await assertReviewInScope(req, tenantId, req.params.id);
    const data = await probationReviewService.cancel(tenantId, req.params.id);

    res.json({ success: true, data });
  },
};
