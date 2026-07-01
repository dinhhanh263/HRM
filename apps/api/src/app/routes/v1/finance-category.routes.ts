import { Router, type Router as RouterType } from 'express';
import { financeCategoryController } from '../../controllers/finance-category.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requireAnyPermission, requirePermission } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  createFinanceCategorySchema,
  updateFinanceCategorySchema,
} from '../../validators/finance-category.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

// SPEC-048: finance categories. Reads open to anyone who can see finance data or
// raise a transaction (they pick a category); writes require cash_transaction:create.
const READ_PERMS = ['finance:view', 'cash_transaction:view'] as const;
const router: RouterType = Router();

router.use(asyncHandler(authenticate));

router.get('/', asyncHandler(requireAnyPermission(...READ_PERMS)), asyncHandler(financeCategoryController.list));
router.post('/', asyncHandler(requirePermission('cash_transaction:create')), validate(createFinanceCategorySchema), asyncHandler(financeCategoryController.create));
router.patch('/:id', asyncHandler(requirePermission('cash_transaction:create')), validate(updateFinanceCategorySchema), asyncHandler(financeCategoryController.update));
router.delete('/:id', asyncHandler(requirePermission('cash_transaction:create')), asyncHandler(financeCategoryController.remove));

export { router as financeCategoryRoutes };
