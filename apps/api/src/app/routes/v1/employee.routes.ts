import { Router, type Router as RouterType } from 'express';
import { employeeController } from '../../controllers/employee.controller.js';
import { employeeImportController } from '../../controllers/employee-import.controller.js';
import { contractRoutes } from './contract.routes.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import { uploadImportFile } from '../../middlewares/upload.middleware.js';
import { createEmployeeSchema, updateEmployeeSchema } from '../../validators/employee.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();

router.use(asyncHandler(authenticate));

// --- Bulk import (must precede '/:id' so 'import' isn't read as an id) ---
router.get(
  '/import/template',
  asyncHandler(requirePermission('employees:import')),
  asyncHandler(employeeImportController.template),
);

router.post(
  '/import/validate',
  asyncHandler(requirePermission('employees:import')),
  uploadImportFile(),
  asyncHandler(employeeImportController.validate),
);

router.post(
  '/import',
  asyncHandler(requirePermission('employees:import')),
  asyncHandler(employeeImportController.enqueue),
);

router.get(
  '/import/:jobId',
  asyncHandler(requirePermission('employees:import')),
  asyncHandler(employeeImportController.status),
);

router.get('/', asyncHandler(requirePermission('employees:view')), asyncHandler(employeeController.getAll));
router.get('/:id', asyncHandler(requirePermission('employees:view')), asyncHandler(employeeController.getById));
router.post('/', asyncHandler(requirePermission('employees:create')), validate(createEmployeeSchema), asyncHandler(employeeController.create));
router.patch('/:id', asyncHandler(requirePermission('employees:update')), validate(updateEmployeeSchema), asyncHandler(employeeController.update));

router.post('/:id/activate', asyncHandler(requirePermission('employees:activate')), asyncHandler(employeeController.activate));
router.post('/:id/deactivate', asyncHandler(requirePermission('employees:deactivate')), asyncHandler(employeeController.deactivate));
router.post('/:id/terminate', asyncHandler(requirePermission('employees:terminate')), asyncHandler(employeeController.terminate));

// Contracts are employee-scoped (SPEC-017). The nested router reads :employeeId via mergeParams.
router.use('/:employeeId/contracts', contractRoutes);

export { router as employeeRoutes };
