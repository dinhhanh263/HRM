import { Router, type Router as RouterType } from 'express';
import { fundAccountController } from '../../controllers/fund-account.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  createFundAccountSchema,
  updateFundAccountSchema,
} from '../../validators/fund-account.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

// SPEC-048: fund accounts (tài khoản quỹ) — tenant-scoped master data for cash flow.
const router: RouterType = Router();

router.use(asyncHandler(authenticate));

router.get('/', asyncHandler(requirePermission('fund_account:view')), asyncHandler(fundAccountController.list));
router.post('/', asyncHandler(requirePermission('fund_account:create')), validate(createFundAccountSchema), asyncHandler(fundAccountController.create));
router.patch('/:id', asyncHandler(requirePermission('fund_account:update')), validate(updateFundAccountSchema), asyncHandler(fundAccountController.update));
router.delete('/:id', asyncHandler(requirePermission('fund_account:delete')), asyncHandler(fundAccountController.remove));

export { router as fundAccountRoutes };
