import { Router, type Router as RouterType } from 'express';
import { settingsController } from '../../controllers/settings.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

// SPEC-036 — tenant settings center. `/public` is readable by any
// authenticated user (regional defaults feed the calendar and i18n for
// everyone); everything else is HR-level via settings:view / settings:update.
const router: RouterType = Router();

router.use(asyncHandler(authenticate));

router.get('/public', asyncHandler(settingsController.getPublicSettings));

router.get(
  '/',
  asyncHandler(requirePermission('settings:view')),
  asyncHandler(settingsController.getSettings),
);

router.get(
  '/audit',
  asyncHandler(requirePermission('settings:view')),
  asyncHandler(settingsController.listAudit),
);

router.patch(
  '/:section',
  asyncHandler(requirePermission('settings:update')),
  asyncHandler(settingsController.patchSection),
);

export { router as settingsRoutes };
