import { Router, type Router as RouterType } from 'express';
import { topUpRequestController } from '../../controllers/topup-request.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requireAnyPermission, requirePermission } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { createTopUpRequestSchema } from '../../validators/topup-request.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

// SPEC-048 GĐ3: top-up requests. HR raises (create/view); Founder reviews
// (approve/reject). `/justification-draft` must precede `/:id`.
const router: RouterType = Router();

router.use(asyncHandler(authenticate));

router.get('/justification-draft', asyncHandler(requirePermission('topup_request:create')), asyncHandler(topUpRequestController.justificationDraft));
router.get('/', asyncHandler(requirePermission('topup_request:view')), asyncHandler(topUpRequestController.list));
router.get('/:id', asyncHandler(requirePermission('topup_request:view')), asyncHandler(topUpRequestController.getById));
router.post('/', asyncHandler(requirePermission('topup_request:create')), validate(createTopUpRequestSchema), asyncHandler(topUpRequestController.create));
router.post('/:id/cancel', asyncHandler(requirePermission('topup_request:create')), asyncHandler(topUpRequestController.cancel));
router.post('/:id/review', asyncHandler(requireAnyPermission('topup_request:approve', 'topup_request:reject')), asyncHandler(topUpRequestController.review));

export { router as topUpRequestRoutes };
