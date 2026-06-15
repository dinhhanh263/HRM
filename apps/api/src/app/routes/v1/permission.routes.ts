import { Router, type Router as RouterType } from 'express';
import { permissionController } from '../../controllers/permission.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();

router.use(asyncHandler(authenticate));

router.get('/', asyncHandler(requirePermission('roles:view')), asyncHandler(permissionController.getCatalog));

export { router as permissionRoutes };
