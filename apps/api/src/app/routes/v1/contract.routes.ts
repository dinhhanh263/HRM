import { Router, type Router as RouterType } from 'express';
import { contractController } from '../../controllers/contract.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import {
  createContractSchema,
  updateContractSchema,
  endContractSchema,
} from '../../validators/contract.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

// mergeParams: inherit :employeeId from the parent mount (/employees/:employeeId/contracts).
const router: RouterType = Router({ mergeParams: true });

router.use(asyncHandler(authenticate));

router.get(
  '/',
  asyncHandler(requirePermission('contracts:view')),
  asyncHandler(contractController.list),
);
router.post(
  '/',
  asyncHandler(requirePermission('contracts:create')),
  validate(createContractSchema),
  asyncHandler(contractController.create),
);
router.patch(
  '/:contractId',
  asyncHandler(requirePermission('contracts:update')),
  validate(updateContractSchema),
  asyncHandler(contractController.update),
);
router.post(
  '/:contractId/end',
  asyncHandler(requirePermission('contracts:update')),
  validate(endContractSchema),
  asyncHandler(contractController.end),
);
router.delete(
  '/:contractId',
  asyncHandler(requirePermission('contracts:delete')),
  asyncHandler(contractController.delete),
);

export { router as contractRoutes };
