import { Router, type Router as RouterType } from 'express';
import { kpiCycleController as c } from '../../controllers/kpi-cycle.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission, requireAnyPermission } from '../../middlewares/authorize.middleware.js';
import {
  createCycleSchema, transitionCycleSchema, bulkEntriesSchema, setScorecardProfileSchema,
  selfAssessSchema, reviewScorecardSchema,
} from '../../validators/kpi-cycle.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();

router.use(asyncHandler(authenticate));

// F2: quản lý chu kỳ + nhập liệu — yêu cầu kpi:enter (manager/HR). Self-view scoped để F3.
const guard = asyncHandler(requirePermission('kpi:enter'));
// Đọc scorecard/xu hướng: nhân viên (kpi:view) xem của mình; manager/HR xem rộng hơn (scope ở controller).
const viewGuard = asyncHandler(requireAnyPermission('kpi:view', 'kpi:view_team', 'kpi:view_all'));

// Đặt route cụ thể TRƯỚC '/:id' để không bị bắt nhầm.
router.get('/my-scorecards', viewGuard, asyncHandler(c.myHistory));
router.get('/employee/:employeeId/history', viewGuard, asyncHandler(c.employeeHistory));

router.get('/', guard, asyncHandler(c.list));
router.get('/:id/export', asyncHandler(requirePermission('kpi:export')), asyncHandler(c.exportCycle));
router.get('/:id', guard, asyncHandler(c.getDetail));
router.post('/', guard, validate(createCycleSchema), asyncHandler(c.create));
router.post('/:id/transition', guard, validate(transitionCycleSchema), asyncHandler(c.transition));
router.put('/:id/entries', guard, validate(bulkEntriesSchema), asyncHandler(c.upsertEntries));
router.post('/:id/aggregate-surveys', guard, asyncHandler(c.aggregateSurveys));
router.put('/scorecards/:scorecardId/profile', guard, validate(setScorecardProfileSchema), asyncHandler(c.setScorecardProfile));

// F4: tự đánh giá (nhân viên) + duyệt/trả về/gửi lại (manager/HR). Scope/đúng-người ở service.
router.put('/scorecards/:scorecardId/self-assess', asyncHandler(requirePermission('kpi:self_assess')), validate(selfAssessSchema), asyncHandler(c.selfAssess));
router.post('/scorecards/:scorecardId/review', asyncHandler(requirePermission('kpi:review')), validate(reviewScorecardSchema), asyncHandler(c.reviewScorecard));
router.post('/scorecards/:scorecardId/resubmit', asyncHandler(requirePermission('kpi:review')), asyncHandler(c.resubmitScorecard));

export { router as kpiCycleRoutes };
