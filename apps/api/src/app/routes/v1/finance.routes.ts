import { Router, type Router as RouterType } from 'express';
import { financeDashboardController } from '../../controllers/finance-dashboard.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

// SPEC-048: finance overview (Dashboard dòng tiền). Read-only aggregates.
const router: RouterType = Router();

router.use(asyncHandler(authenticate));

router.get('/dashboard', asyncHandler(requirePermission('finance:view')), asyncHandler(financeDashboardController.dashboard));
router.get('/budget-vs-actual', asyncHandler(requirePermission('finance:view')), asyncHandler(financeDashboardController.budgetVsActual));
router.get('/forecast', asyncHandler(requirePermission('finance:view')), asyncHandler(financeDashboardController.forecast));
router.get('/report', asyncHandler(requirePermission('finance:view')), asyncHandler(financeDashboardController.report));
router.get('/report/export', asyncHandler(requirePermission('finance:export')), asyncHandler(financeDashboardController.reportExport));

export { router as financeRoutes };
