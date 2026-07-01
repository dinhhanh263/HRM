import { Router, type Router as RouterType } from 'express';
import { spendingPlanController } from '../../controllers/spending-plan.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  createSpendingPlanSchema,
  updateSpendingPlanSchema,
} from '../../validators/spending-plan.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

// SPEC-048 GĐ2: spending plans. MANAGER manages own-dept plans (scope in service);
// HR reviews. scope=all restricted in the controller to approve/reject capability.
const router: RouterType = Router();

router.use(asyncHandler(authenticate));

router.get('/', asyncHandler(requirePermission('spending_plan:view')), asyncHandler(spendingPlanController.list));
router.get('/:id', asyncHandler(requirePermission('spending_plan:view')), asyncHandler(spendingPlanController.getById));
router.post('/', asyncHandler(requirePermission('spending_plan:create')), validate(createSpendingPlanSchema), asyncHandler(spendingPlanController.create));
router.patch('/:id', asyncHandler(requirePermission('spending_plan:update')), validate(updateSpendingPlanSchema), asyncHandler(spendingPlanController.update));
router.post('/:id/submit', asyncHandler(requirePermission('spending_plan:submit')), asyncHandler(spendingPlanController.submit));

export { router as spendingPlanRoutes };
