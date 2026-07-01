import { Router, type Router as RouterType } from 'express';
import { financeDashboardController } from '../../controllers/finance-dashboard.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

// SPEC-048: finance overview (Dashboard dòng tiền). Read-only aggregates.
const router: RouterType = Router();

router.use(asyncHandler(authenticate));

router.get('/dashboard', asyncHandler(requirePermission('finance:view')), asyncHandler(financeDashboardController.dashboard));

export { router as financeRoutes };
