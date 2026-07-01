import { Router, type Router as RouterType } from 'express';
import { cashTransactionController } from '../../controllers/cash-transaction.controller.js';
import { cashTransactionImportController } from '../../controllers/cash-transaction-import.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { uploadImportFile } from '../../middlewares/upload.middleware.js';
import {
  createCashTransactionSchema,
  updateCashTransactionSchema,
} from '../../validators/cash-transaction.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

// SPEC-048: cash transactions (sổ giao dịch thu/chi). Balance recompute is atomic
// in the service; RBAC via cash_transaction:*.
const router: RouterType = Router();

router.use(asyncHandler(authenticate));

// Import routes first (before any future `/:id`) — gated by cash_transaction:import.
router.get('/import/template', asyncHandler(requirePermission('cash_transaction:import')), asyncHandler(cashTransactionImportController.template));
router.post('/import/parse', asyncHandler(requirePermission('cash_transaction:import')), uploadImportFile(), asyncHandler(cashTransactionImportController.parse));
router.post('/import/confirm', asyncHandler(requirePermission('cash_transaction:import')), uploadImportFile(), asyncHandler(cashTransactionImportController.confirm));

router.get('/', asyncHandler(requirePermission('cash_transaction:view')), asyncHandler(cashTransactionController.list));
router.post('/', asyncHandler(requirePermission('cash_transaction:create')), validate(createCashTransactionSchema), asyncHandler(cashTransactionController.create));
router.patch('/:id', asyncHandler(requirePermission('cash_transaction:update')), validate(updateCashTransactionSchema), asyncHandler(cashTransactionController.update));
router.delete('/:id', asyncHandler(requirePermission('cash_transaction:delete')), asyncHandler(cashTransactionController.remove));

export { router as cashTransactionRoutes };
