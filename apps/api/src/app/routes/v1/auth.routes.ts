import { Router, type Router as RouterType } from 'express';
import { authController } from '../../controllers/auth.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authLimiter } from '../../middlewares/rate-limit.middleware.js';
import {
  registerSchema,
  loginSchema,
  setPasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../../validators/auth.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();

// SPEC-038: authLimiter sits BEFORE validate so malformed bodies still count
// toward the 5-attempts/15-min budget (keyed per route + IP + email).
router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(authController.register),
);
router.post('/login', authLimiter, validate(loginSchema), asyncHandler(authController.login));
// Google Workspace SSO (OAuth 2.0 authorization-code flow). Browser navigations
// (GET) — the callback sets the refresh cookie then bounces to the frontend.
router.get('/google', asyncHandler(authController.googleStart));
router.get('/google/callback', asyncHandler(authController.googleCallback));
router.post('/refresh', asyncHandler(authController.refresh));
router.post('/logout', asyncHandler(authController.logout));
router.post(
  '/set-password',
  authLimiter,
  validate(setPasswordSchema),
  asyncHandler(authController.setPassword),
);
router.post(
  '/forgot-password',
  authLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(authController.forgotPassword),
);
router.post(
  '/reset-password',
  authLimiter,
  validate(resetPasswordSchema),
  asyncHandler(authController.resetPassword),
);
router.get('/me', asyncHandler(authenticate), asyncHandler(authController.me));
// SPEC-037: self-service password change (logged-in).
router.post(
  '/change-password',
  authLimiter,
  asyncHandler(authenticate),
  validate(changePasswordSchema),
  asyncHandler(authController.changePassword),
);

export { router as authRoutes };
