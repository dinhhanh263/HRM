import { Router, type Router as RouterType } from 'express';
import { roleController } from '../../controllers/role.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import { createRoleSchema, updateRoleSchema } from '../../validators/role.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();

router.use(asyncHandler(authenticate));

router.get('/', asyncHandler(requirePermission('roles:view')), asyncHandler(roleController.getAll));
router.get('/:id', asyncHandler(requirePermission('roles:view')), asyncHandler(roleController.getById));
router.post('/', asyncHandler(requirePermission('roles:create')), validate(createRoleSchema), asyncHandler(roleController.create));
router.patch('/:id', asyncHandler(requirePermission('roles:update')), validate(updateRoleSchema), asyncHandler(roleController.update));
router.delete('/:id', asyncHandler(requirePermission('roles:delete')), asyncHandler(roleController.delete));

export { router as roleRoutes };
