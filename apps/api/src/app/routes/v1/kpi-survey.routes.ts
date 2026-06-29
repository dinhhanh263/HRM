import { Router, type Router as RouterType } from 'express';
import { kpiSurveyController as c } from '../../controllers/kpi-survey.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission, requireAnyPermission } from '../../middlewares/authorize.middleware.js';
import {
  createSurveySchema, updateSurveySchema, surveyQuestionSchema, submitResponseSchema,
} from '../../validators/kpi-survey.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();
router.use(asyncHandler(authenticate));

const manage = asyncHandler(requirePermission('kpi:survey_manage'));
// Nhân viên trả lời survey (ẩn danh) — chỉ cần truy cập KPI cơ bản.
const respondGuard = asyncHandler(requireAnyPermission('kpi:view', 'kpi:self_assess', 'kpi:survey_manage'));

router.get('/active', respondGuard, asyncHandler(c.listActive));
router.post('/:id/responses', respondGuard, validate(submitResponseSchema), asyncHandler(c.respond));

router.get('/', manage, asyncHandler(c.list));
router.post('/', manage, validate(createSurveySchema), asyncHandler(c.create));
router.patch('/:id', manage, validate(updateSurveySchema), asyncHandler(c.update));
router.delete('/:id', manage, asyncHandler(c.remove));
router.post('/:id/questions', manage, validate(surveyQuestionSchema), asyncHandler(c.addQuestion));
router.delete('/:id/questions/:questionId', manage, asyncHandler(c.removeQuestion));

export { router as kpiSurveyRoutes };
