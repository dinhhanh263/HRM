import { Router, type Router as RouterType } from 'express';
import { departmentController } from '../../controllers/department.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import { createDepartmentSchema, updateDepartmentSchema } from '../../validators/department.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();

router.use(asyncHandler(authenticate));

router.get('/', asyncHandler(requirePermission('departments:view')), asyncHandler(departmentController.getAll));
router.get('/:id', asyncHandler(requirePermission('departments:view')), asyncHandler(departmentController.getById));
router.post('/', asyncHandler(requirePermission('departments:create')), validate(createDepartmentSchema), asyncHandler(departmentController.create));
router.patch('/:id', asyncHandler(requirePermission('departments:update')), validate(updateDepartmentSchema), asyncHandler(departmentController.update));
router.delete('/:id', asyncHandler(requirePermission('departments:delete')), asyncHandler(departmentController.delete));

export { router as departmentRoutes };
