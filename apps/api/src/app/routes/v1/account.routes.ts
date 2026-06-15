import { Router, type Router as RouterType } from 'express';
import { accountController } from '../../controllers/account.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  updateMyProfileSchema,
  updateNotificationPrefsSchema,
} from '../../validators/account.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

// SPEC-037 — self-service: authenticate only, no permission key. Every handler
// acts solely on req.user.sub; client-supplied ids are never accepted.
const router: RouterType = Router();

router.use(asyncHandler(authenticate));

router.get('/', asyncHandler(accountController.getAccount));
router.patch(
  '/profile',
  validate(updateMyProfileSchema),
  asyncHandler(accountController.updateProfile),
);
router.patch(
  '/notifications',
  validate(updateNotificationPrefsSchema),
  asyncHandler(accountController.updateNotificationPrefs),
);
router.get('/sessions', asyncHandler(accountController.getSessions));
router.post('/sessions/revoke-others', asyncHandler(accountController.revokeOtherSessions));

export { router as accountRoutes };
