import { Router, type Router as RouterType } from 'express';
import { leaveController } from '../../controllers/leave.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import {
  createLeaveTypeSchema,
  updateLeaveTypeSchema,
  createLeaveRequestSchema,
  rejectLeaveRequestSchema,
  createApprovalFlowSchema,
  updateApprovalFlowSchema,
  replaceApprovalStepsSchema,
  setLeaveBalanceSchema,
  updateLeaveSettingsSchema,
} from '../../validators/leave.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();

router.use(asyncHandler(authenticate));

// ---- Leave types ----
router.get('/types', asyncHandler(requirePermission('leave:view')), asyncHandler(leaveController.listTypes));
router.post('/types', asyncHandler(requirePermission('leave:configure')), validate(createLeaveTypeSchema), asyncHandler(leaveController.createType));
router.patch('/types/:id', asyncHandler(requirePermission('leave:configure')), validate(updateLeaveTypeSchema), asyncHandler(leaveController.updateType));
router.delete('/types/:id', asyncHandler(requirePermission('leave:configure')), asyncHandler(leaveController.deleteType));

// ---- Approval flows ---- (all gated by leave:configure → HR/Admin)
router.get('/flows', asyncHandler(requirePermission('leave:configure')), asyncHandler(leaveController.listFlows));
router.post('/flows', asyncHandler(requirePermission('leave:configure')), validate(createApprovalFlowSchema), asyncHandler(leaveController.createFlow));
router.get('/flows/:id', asyncHandler(requirePermission('leave:configure')), asyncHandler(leaveController.getFlow));
router.patch('/flows/:id', asyncHandler(requirePermission('leave:configure')), validate(updateApprovalFlowSchema), asyncHandler(leaveController.updateFlow));
router.put('/flows/:id/steps', asyncHandler(requirePermission('leave:configure')), validate(replaceApprovalStepsSchema), asyncHandler(leaveController.replaceFlowSteps));
router.delete('/flows/:id', asyncHandler(requirePermission('leave:configure')), asyncHandler(leaveController.deleteFlow));

// ---- Settings ---- (tenant-level leave config; HR/Admin only)
router.get('/settings', asyncHandler(requirePermission('leave:configure')), asyncHandler(leaveController.getSettings));
router.patch('/settings', asyncHandler(requirePermission('leave:configure')), validate(updateLeaveSettingsSchema), asyncHandler(leaveController.updateSettings));

// ---- Balances ----
// Roster (company-wide / team overview) is gated by leave:view on the route;
// the controller additionally requires review capability for cross-employee reads.
router.get('/balances/roster/export', asyncHandler(requirePermission('leave:view')), asyncHandler(leaveController.exportRoster));
router.get('/balances/roster', asyncHandler(requirePermission('leave:view')), asyncHandler(leaveController.getRoster));
router.get('/balances', asyncHandler(requirePermission('leave:view')), asyncHandler(leaveController.getBalances));
// Writing a per-employee allocation override is an HR/Admin config action.
router.put('/balances', asyncHandler(requirePermission('leave:configure')), validate(setLeaveBalanceSchema), asyncHandler(leaveController.setBalance));

// ---- Leave requests ----
router.get('/requests', asyncHandler(requirePermission('leave:view')), asyncHandler(leaveController.listRequests));
router.get('/requests/:id', asyncHandler(requirePermission('leave:view')), asyncHandler(leaveController.getRequest));
router.post('/requests', asyncHandler(requirePermission('leave:create')), validate(createLeaveRequestSchema), asyncHandler(leaveController.createRequest));
router.post('/requests/:id/resubmit', asyncHandler(requirePermission('leave:create')), validate(createLeaveRequestSchema), asyncHandler(leaveController.resubmitRequest));
router.post('/requests/:id/cancel', asyncHandler(requirePermission('leave:view')), asyncHandler(leaveController.cancelRequest));
router.post('/requests/:id/approve', asyncHandler(requirePermission('leave:approve')), asyncHandler(leaveController.approveRequest));
router.post('/requests/:id/reject', asyncHandler(requirePermission('leave:reject')), validate(rejectLeaveRequestSchema), asyncHandler(leaveController.rejectRequest));

export { router as leaveRoutes };
