import { Router, type Router as RouterType } from 'express';
import { timesheetController } from '../../controllers/timesheet.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import {
  updateTimesheetPolicySchema,
  createHolidaySchema,
  updateHolidaySchema,
  seedHolidaysSchema,
  checkInSchema,
  checkOutSchema,
  adjustAttendanceSchema,
  createOvertimeSchema,
  rejectOvertimeSchema,
} from '../../validators/timesheet.validator.js';
import {
  createApprovalFlowSchema,
  updateApprovalFlowSchema,
  replaceApprovalStepsSchema,
} from '../../validators/leave.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();

router.use(asyncHandler(authenticate));

// ---- Policy ----
router.get('/policy', asyncHandler(requirePermission('timesheet:view')), asyncHandler(timesheetController.getPolicy));
router.patch('/policy', asyncHandler(requirePermission('timesheet:configure')), validate(updateTimesheetPolicySchema), asyncHandler(timesheetController.updatePolicy));

// ---- Holidays ----
router.get('/holidays', asyncHandler(requirePermission('timesheet:view')), asyncHandler(timesheetController.listHolidays));
router.post('/holidays', asyncHandler(requirePermission('timesheet:configure')), validate(createHolidaySchema), asyncHandler(timesheetController.createHoliday));
router.post('/holidays/seed', asyncHandler(requirePermission('timesheet:configure')), validate(seedHolidaysSchema), asyncHandler(timesheetController.seedHolidays));
router.patch('/holidays/:id', asyncHandler(requirePermission('timesheet:configure')), validate(updateHolidaySchema), asyncHandler(timesheetController.updateHoliday));
router.delete('/holidays/:id', asyncHandler(requirePermission('timesheet:configure')), asyncHandler(timesheetController.deleteHoliday));

// ---- Attendance (self-service) ----
router.get('/attendance/me', asyncHandler(requirePermission('timesheet:view')), asyncHandler(timesheetController.listMyAttendance));
router.post('/attendance/check-in', asyncHandler(requirePermission('timesheet:create')), validate(checkInSchema), asyncHandler(timesheetController.checkIn));
router.post('/attendance/check-out', asyncHandler(requirePermission('timesheet:create')), validate(checkOutSchema), asyncHandler(timesheetController.checkOut));

// ---- Attendance (reviewer scope: manager team / HR all) ----
router.get('/attendance', asyncHandler(requirePermission('timesheet:update')), asyncHandler(timesheetController.listTeamAttendance));
router.post('/attendance/adjust', asyncHandler(requirePermission('timesheet:update')), validate(adjustAttendanceSchema), asyncHandler(timesheetController.adjustAttendance));

// ---- Overtime approval flows ---- (all gated by timesheet:configure → HR/Admin)
// Declared before the /overtime/:id routes so "flows" is never captured as an :id.
router.get('/overtime/flows', asyncHandler(requirePermission('timesheet:configure')), asyncHandler(timesheetController.listOvertimeFlows));
router.post('/overtime/flows', asyncHandler(requirePermission('timesheet:configure')), validate(createApprovalFlowSchema), asyncHandler(timesheetController.createOvertimeFlow));
router.get('/overtime/flows/:id', asyncHandler(requirePermission('timesheet:configure')), asyncHandler(timesheetController.getOvertimeFlow));
router.patch('/overtime/flows/:id', asyncHandler(requirePermission('timesheet:configure')), validate(updateApprovalFlowSchema), asyncHandler(timesheetController.updateOvertimeFlow));
router.put('/overtime/flows/:id/steps', asyncHandler(requirePermission('timesheet:configure')), validate(replaceApprovalStepsSchema), asyncHandler(timesheetController.replaceOvertimeFlowSteps));
router.delete('/overtime/flows/:id', asyncHandler(requirePermission('timesheet:configure')), asyncHandler(timesheetController.deleteOvertimeFlow));

// ---- Overtime (self-service submit + own list) ----
router.get('/overtime/me', asyncHandler(requirePermission('timesheet:view')), asyncHandler(timesheetController.listMyOvertime));
router.post('/overtime', asyncHandler(requirePermission('timesheet:create')), validate(createOvertimeSchema), asyncHandler(timesheetController.submitOvertime));

// ---- Overtime (owner withdraws / resubmits own request) ----
router.post('/overtime/:id/cancel', asyncHandler(requirePermission('timesheet:create')), asyncHandler(timesheetController.cancelOvertime));
router.patch('/overtime/:id/resubmit', asyncHandler(requirePermission('timesheet:create')), validate(createOvertimeSchema), asyncHandler(timesheetController.resubmitOvertime));

// ---- Overtime (reviewer: current-step queue by default, scope=all for HR) ----
router.get('/overtime', asyncHandler(requirePermission('timesheet:update')), asyncHandler(timesheetController.listTeamOvertime));
router.get('/overtime/:id', asyncHandler(requirePermission('timesheet:view')), asyncHandler(timesheetController.getOvertime));
router.post('/overtime/:id/approve', asyncHandler(requirePermission('timesheet:approve')), asyncHandler(timesheetController.approveOvertime));
router.post('/overtime/:id/reject', asyncHandler(requirePermission('timesheet:approve')), validate(rejectOvertimeSchema), asyncHandler(timesheetController.rejectOvertime));

// ---- Summary (Payroll contract; own by default, reviewer scope enforced in controller) ----
router.get('/summary', asyncHandler(requirePermission('timesheet:view')), asyncHandler(timesheetController.getSummary));

export { router as timesheetRoutes };
