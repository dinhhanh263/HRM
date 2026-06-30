import { Router, type Router as RouterType } from 'express';
import { issuingEntityController } from '../../controllers/issuing-entity.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requireAnyPermission, requirePermission } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { uploadEntityLogo } from '../../middlewares/entity-logo-upload.middleware.js';
import {
  createIssuingEntitySchema,
  updateIssuingEntitySchema,
} from '../../validators/issuing-entity.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

// SPEC-043: issuing entities (pháp nhân phát hành) — tenant config. Writes stay
// settings:update (Settings center only). Reads are also needed by purchase-request
// creators who pick an issuing entity in the PR form, so the list/logo GETs accept
// settings:view OR purchase_request:view/create — otherwise the dropdown 403s for
// staff who can raise a PR but lack settings access, and the field silently hides.
const READ_PERMS = ['settings:view', 'purchase_request:view', 'purchase_request:create'] as const;
const router: RouterType = Router();

router.use(asyncHandler(authenticate));

router.get('/', asyncHandler(requireAnyPermission(...READ_PERMS)), asyncHandler(issuingEntityController.list));
router.post('/', asyncHandler(requirePermission('settings:update')), validate(createIssuingEntitySchema), asyncHandler(issuingEntityController.create));
router.patch('/:id', asyncHandler(requirePermission('settings:update')), validate(updateIssuingEntitySchema), asyncHandler(issuingEntityController.update));
router.delete('/:id', asyncHandler(requirePermission('settings:update')), asyncHandler(issuingEntityController.remove));

// Logo: upload (multipart `file`), serve (thumbnail), clear.
router.post('/:id/logo', asyncHandler(requirePermission('settings:update')), uploadEntityLogo(), asyncHandler(issuingEntityController.uploadLogo));
router.delete('/:id/logo', asyncHandler(requirePermission('settings:update')), asyncHandler(issuingEntityController.deleteLogo));
router.get('/:id/logo', asyncHandler(requireAnyPermission(...READ_PERMS)), asyncHandler(issuingEntityController.getLogo));

export { router as issuingEntityRoutes };
