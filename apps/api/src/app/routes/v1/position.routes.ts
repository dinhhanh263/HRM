import { Router, type Router as RouterType } from 'express';
import { positionController } from '../../controllers/position.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import { createPositionSchema, updatePositionSchema } from '../../validators/position.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();

router.use(asyncHandler(authenticate));

router.get('/', asyncHandler(requirePermission('positions:view')), asyncHandler(positionController.getAll));
router.get('/:id', asyncHandler(requirePermission('positions:view')), asyncHandler(positionController.getById));
router.post('/', asyncHandler(requirePermission('positions:create')), validate(createPositionSchema), asyncHandler(positionController.create));
router.patch('/:id', asyncHandler(requirePermission('positions:update')), validate(updatePositionSchema), asyncHandler(positionController.update));
router.delete('/:id', asyncHandler(requirePermission('positions:delete')), asyncHandler(positionController.delete));

export { router as positionRoutes };
