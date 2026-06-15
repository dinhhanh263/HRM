import { Router, type Router as RouterType } from 'express';
import { probationController } from '../../controllers/probation.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import {
  createProbationCriteriaSchema,
  updateProbationCriteriaSchema,
  createProbationGuidelineSchema,
  updateProbationGuidelineSchema,
  createProbationReviewSchema,
  patchProbationReviewSchema,
  submitProbationReviewSchema,
  patchProbationSelfSchema,
  submitProbationSelfSchema,
  decideReviewSchema,
} from '../../validators/probation.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();

router.use(asyncHandler(authenticate));

// ---- Criteria ---- (HR configures; anyone with probation:view can read for scoring)
router.get('/criteria', asyncHandler(requirePermission('probation:view')), asyncHandler(probationController.listCriteria));
router.post('/criteria', asyncHandler(requirePermission('probation:configure')), validate(createProbationCriteriaSchema), asyncHandler(probationController.createCriteria));
router.patch('/criteria/:id', asyncHandler(requirePermission('probation:configure')), validate(updateProbationCriteriaSchema), asyncHandler(probationController.updateCriteria));
router.delete('/criteria/:id', asyncHandler(requirePermission('probation:configure')), asyncHandler(probationController.deleteCriteria));

// ---- Guidelines (SPEC-032) ---- (HR soạn; mọi probation:view đọc được)
router.get('/guidelines', asyncHandler(requirePermission('probation:view')), asyncHandler(probationController.listGuidelines));
router.post('/guidelines', asyncHandler(requirePermission('probation:configure')), validate(createProbationGuidelineSchema), asyncHandler(probationController.createGuideline));
router.patch('/guidelines/:id', asyncHandler(requirePermission('probation:configure')), validate(updateProbationGuidelineSchema), asyncHandler(probationController.updateGuideline));
router.delete('/guidelines/:id', asyncHandler(requirePermission('probation:configure')), asyncHandler(probationController.deleteGuideline));

// ---- Self Evaluation (SPEC-033) ---- (ownership của chính mình enforce trong service)
// LƯU Ý: /reviews/me phải đứng TRƯỚC /reviews/:id để không bị nuốt làm id='me'.
router.get('/reviews/me', asyncHandler(requirePermission('probation:self')), asyncHandler(probationController.getMyReview));
router.patch('/reviews/:id/self', asyncHandler(requirePermission('probation:self')), validate(patchProbationSelfSchema), asyncHandler(probationController.patchSelf));
router.post('/reviews/:id/self/submit', asyncHandler(requirePermission('probation:self')), validate(submitProbationSelfSchema), asyncHandler(probationController.submitSelf));

// ---- Reviews ---- (MANAGER scope enforced in the controller)
router.get('/reviews', asyncHandler(requirePermission('probation:view')), asyncHandler(probationController.listReviews));
router.post('/reviews', asyncHandler(requirePermission('probation:review')), validate(createProbationReviewSchema), asyncHandler(probationController.createReview));
router.get('/reviews/:id', asyncHandler(requirePermission('probation:view')), asyncHandler(probationController.getReview));
router.patch('/reviews/:id', asyncHandler(requirePermission('probation:review')), validate(patchProbationReviewSchema), asyncHandler(probationController.patchReview));
router.post('/reviews/:id/submit', asyncHandler(requirePermission('probation:review')), validate(submitProbationReviewSchema), asyncHandler(probationController.submitReview));
router.post('/reviews/:id/decide', asyncHandler(requirePermission('probation:decide')), validate(decideReviewSchema), asyncHandler(probationController.decideReview));
router.post('/reviews/:id/cancel', asyncHandler(requirePermission('probation:review')), asyncHandler(probationController.cancelReview));

export { router as probationRoutes };
