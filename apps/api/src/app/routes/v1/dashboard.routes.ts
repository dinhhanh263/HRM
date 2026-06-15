import { Router, type Router as RouterType } from 'express';
import { dashboardController } from '../../controllers/dashboard.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();

router.use(asyncHandler(authenticate));

router.get(
  '/',
  asyncHandler(requirePermission('dashboard:view')),
  asyncHandler(dashboardController.getDashboard),
);

// SPEC-035: month view for the event calendar (?month=YYYY-MM).
router.get(
  '/events',
  asyncHandler(requirePermission('dashboard:view')),
  asyncHandler(dashboardController.getCalendarEvents),
);

export { router as dashboardRoutes };
