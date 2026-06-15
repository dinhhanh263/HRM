import { Router, type Router as RouterType } from 'express';
import { payrollController } from '../../controllers/payroll.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission, requireAnyPermission } from '../../middlewares/authorize.middleware.js';
import {
  updatePayrollSettingsSchema,
  createEmployeeSalarySchema,
  createPayrollRunSchema,
} from '../../validators/payroll.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();

router.use(asyncHandler(authenticate));

// ---- Settings (tenant payroll config; HR-only) ----
router.get('/settings', asyncHandler(requirePermission('payroll:process')), asyncHandler(payrollController.getSettings));
router.patch('/settings', asyncHandler(requirePermission('payroll:process')), validate(updatePayrollSettingsSchema), asyncHandler(payrollController.updateSettings));

// ---- Salaries (effective-dated; HR-only — exposes every employee's pay) ----
router.get('/salaries', asyncHandler(requirePermission('payroll:process')), asyncHandler(payrollController.listSalaryRoster));
router.post('/salaries', asyncHandler(requirePermission('payroll:process')), validate(createEmployeeSalarySchema), asyncHandler(payrollController.createSalary));
router.get('/salaries/:employeeId', asyncHandler(requirePermission('payroll:process')), asyncHandler(payrollController.listEmployeeSalaries));
router.delete('/salaries/:id', asyncHandler(requirePermission('payroll:process')), asyncHandler(payrollController.deleteSalary));

// ---- Runs (the roster and run detail expose every employee's payslip, so they
//      require payroll:process (HR) OR payroll:approve (the checker) — NOT
//      payroll:view, which EMPLOYEE/MANAGER hold for self-service payslips. The
//      approver must read the run + its payslips to make an approval decision) ----
router.post('/runs', asyncHandler(requirePermission('payroll:process')), validate(createPayrollRunSchema), asyncHandler(payrollController.createRun));
router.get('/runs', asyncHandler(requireAnyPermission('payroll:process', 'payroll:approve')), asyncHandler(payrollController.listRuns));
router.get('/runs/:id', asyncHandler(requireAnyPermission('payroll:process', 'payroll:approve')), asyncHandler(payrollController.getRun));
router.get('/runs/:id/export', asyncHandler(requirePermission('payroll:export')), asyncHandler(payrollController.exportRunPdf));

// ---- Run lifecycle transitions (maker-checker: the maker holds payroll:process
//      (recompute/submit/mark-paid/cancel); the checker holds payroll:approve
//      (approve/reject). Status guards enforced by the service) ----
router.post('/runs/:id/recompute', asyncHandler(requirePermission('payroll:process')), asyncHandler(payrollController.recomputeRun));
router.post('/runs/:id/submit', asyncHandler(requirePermission('payroll:process')), asyncHandler(payrollController.submitRun));
router.post('/runs/:id/approve', asyncHandler(requirePermission('payroll:approve')), asyncHandler(payrollController.approveRun));
router.post('/runs/:id/reject', asyncHandler(requirePermission('payroll:approve')), asyncHandler(payrollController.rejectRun));
router.post('/runs/:id/mark-paid', asyncHandler(requirePermission('payroll:process')), asyncHandler(payrollController.markRunPaid));
router.post('/runs/:id/cancel', asyncHandler(requirePermission('payroll:process')), asyncHandler(payrollController.cancelRun));

// ---- Payslips (self-service; /me before /:id so it isn't captured as an id) ----
router.get('/payslips/me', asyncHandler(requirePermission('payroll:view')), asyncHandler(payrollController.listMyPayslips));
router.get('/payslips/:id/pdf', asyncHandler(requirePermission('payroll:view')), asyncHandler(payrollController.getPayslipPdf));
router.get('/payslips/:id', asyncHandler(requirePermission('payroll:view')), asyncHandler(payrollController.getPayslip));

export { router as payrollRoutes };
