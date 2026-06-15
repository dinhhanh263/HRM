import { Router, type Router as RouterType } from 'express';
import { notificationController } from '../../controllers/notification.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();

router.use(asyncHandler(authenticate));

// All notification endpoints are caller-scoped: every user may read and clear
// their own feed, so a single 'notifications:view' guard covers the surface.
router.get(
  '/',
  asyncHandler(requirePermission('notifications:view')),
  asyncHandler(notificationController.list),
);
router.post(
  '/read-all',
  asyncHandler(requirePermission('notifications:view')),
  asyncHandler(notificationController.markAllRead),
);
router.patch(
  '/:id/read',
  asyncHandler(requirePermission('notifications:view')),
  asyncHandler(notificationController.markRead),
);

export { router as notificationRoutes };
