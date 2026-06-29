import { Router, type Router as RouterType } from 'express';
import { kpiTeamController as c } from '../../controllers/kpi-team.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import { upsertTeamSchema } from '../../validators/kpi-team.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();

router.use(asyncHandler(authenticate));

// Quản lý Team/Squad gắn với cấu hình KPI → dùng quyền kpi:config.
const guard = asyncHandler(requirePermission('kpi:config'));

router.get('/', guard, asyncHandler(c.getAll));
router.post('/', guard, validate(upsertTeamSchema), asyncHandler(c.create));
router.patch('/:id', guard, validate(upsertTeamSchema), asyncHandler(c.update));
router.delete('/:id', guard, asyncHandler(c.remove));

export { router as kpiTeamRoutes };
