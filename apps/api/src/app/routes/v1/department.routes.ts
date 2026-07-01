import { Router, type Router as RouterType } from 'express';
import { departmentController } from '../../controllers/department.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requireAnyPermission, requirePermission } from '../../middlewares/authorize.middleware.js';
import { createDepartmentSchema, updateDepartmentSchema } from '../../validators/department.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();

router.use(asyncHandler(authenticate));

// SPEC-048 GĐ2': the list is also needed by anyone raising a spending plan (to pick a
// department), so allow spending_plan:create too. The Departments admin page stays
// gated by departments:view via the sidebar.
router.get('/', asyncHandler(requireAnyPermission('departments:view', 'spending_plan:create')), asyncHandler(departmentController.getAll));
router.get('/:id', asyncHandler(requirePermission('departments:view')), asyncHandler(departmentController.getById));
router.post('/', asyncHandler(requirePermission('departments:create')), validate(createDepartmentSchema), asyncHandler(departmentController.create));
router.patch('/:id', asyncHandler(requirePermission('departments:update')), validate(updateDepartmentSchema), asyncHandler(departmentController.update));
router.delete('/:id', asyncHandler(requirePermission('departments:delete')), asyncHandler(departmentController.delete));

export { router as departmentRoutes };
