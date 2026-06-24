import { Router, type Router as RouterType } from 'express';
import { issuingEntityController } from '../../controllers/issuing-entity.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { uploadEntityLogo } from '../../middlewares/entity-logo-upload.middleware.js';
import {
  createIssuingEntitySchema,
  updateIssuingEntitySchema,
} from '../../validators/issuing-entity.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

// SPEC-043: issuing entities (pháp nhân phát hành) — tenant config, gated by the
// same settings perms as the Settings center (settings:view / settings:update).
const router: RouterType = Router();

router.use(asyncHandler(authenticate));

router.get('/', asyncHandler(requirePermission('settings:view')), asyncHandler(issuingEntityController.list));
router.post('/', asyncHandler(requirePermission('settings:update')), validate(createIssuingEntitySchema), asyncHandler(issuingEntityController.create));
router.patch('/:id', asyncHandler(requirePermission('settings:update')), validate(updateIssuingEntitySchema), asyncHandler(issuingEntityController.update));
router.delete('/:id', asyncHandler(requirePermission('settings:update')), asyncHandler(issuingEntityController.remove));

// Logo: upload (multipart `file`), serve (thumbnail), clear.
router.post('/:id/logo', asyncHandler(requirePermission('settings:update')), uploadEntityLogo(), asyncHandler(issuingEntityController.uploadLogo));
router.delete('/:id/logo', asyncHandler(requirePermission('settings:update')), asyncHandler(issuingEntityController.deleteLogo));
router.get('/:id/logo', asyncHandler(requirePermission('settings:view')), asyncHandler(issuingEntityController.getLogo));

export { router as issuingEntityRoutes };
