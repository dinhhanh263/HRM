import { Router, type Router as RouterType } from 'express';
import { assetController } from '../../controllers/asset.controller.js';
import { assetImportController } from '../../controllers/asset-import.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import {
  createAssetCategorySchema,
  updateAssetCategorySchema,
  createAssetSchema,
  updateAssetSchema,
  assignAssetSchema,
  acknowledgeHandoverSchema,
  returnAssetSchema,
  createMaintenanceSchema,
  completeMaintenanceSchema,
  disposeAssetSchema,
} from '../../validators/asset.validator.js';
import { uploadImportFile } from '../../middlewares/upload.middleware.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();

router.use(asyncHandler(authenticate));

// ── Categories (loại tài sản, cấu hình theo tenant) ────────────────────────
router.get(
  '/categories',
  asyncHandler(requirePermission('assets:view')),
  asyncHandler(assetController.listCategories),
);
router.post(
  '/categories',
  asyncHandler(requirePermission('assets:configure')),
  validate(createAssetCategorySchema),
  asyncHandler(assetController.createCategory),
);
router.patch(
  '/categories/:id',
  asyncHandler(requirePermission('assets:configure')),
  validate(updateAssetCategorySchema),
  asyncHandler(assetController.updateCategory),
);
router.delete(
  '/categories/:id',
  asyncHandler(requirePermission('assets:configure')),
  asyncHandler(assetController.deleteCategory),
);

// ── Bulk import (must precede '/:id' so 'import' isn't read as an id) ───────
router.get(
  '/import/template',
  asyncHandler(requirePermission('assets:import')),
  asyncHandler(assetImportController.template),
);
router.post(
  '/import/validate',
  asyncHandler(requirePermission('assets:import')),
  uploadImportFile(),
  asyncHandler(assetImportController.validate),
);
router.post(
  '/import',
  asyncHandler(requirePermission('assets:import')),
  asyncHandler(assetImportController.confirm),
);

// ── Assets (tài sản) ───────────────────────────────────────────────────────
router.get(
  '/',
  asyncHandler(requirePermission('assets:view')),
  asyncHandler(assetController.list),
);
// Self-service — must precede '/:id' so "mine" is not captured as an id.
router.get(
  '/mine',
  asyncHandler(requirePermission('assets:view')),
  asyncHandler(assetController.listMine),
);
// CSV export — must precede '/:id' so "export" is not captured as an id.
router.get(
  '/export',
  asyncHandler(requirePermission('assets:export')),
  asyncHandler(assetController.exportCsv),
);
router.get(
  '/:id',
  asyncHandler(requirePermission('assets:view')),
  asyncHandler(assetController.getById),
);
router.post(
  '/',
  asyncHandler(requirePermission('assets:create')),
  validate(createAssetSchema),
  asyncHandler(assetController.create),
);
router.patch(
  '/:id',
  asyncHandler(requirePermission('assets:update')),
  validate(updateAssetSchema),
  asyncHandler(assetController.update),
);
router.delete(
  '/:id',
  asyncHandler(requirePermission('assets:delete')),
  asyncHandler(assetController.remove),
);

// ── Assignment lifecycle (cấp phát / thu hồi) ──────────────────────────────
router.post(
  '/:id/assign',
  asyncHandler(requirePermission('assets:assign')),
  validate(assignAssetSchema),
  asyncHandler(assetController.assign),
);
router.post(
  '/:id/return',
  asyncHandler(requirePermission('assets:assign')),
  validate(returnAssetSchema),
  asyncHandler(assetController.returnAsset),
);
// IN_APP acknowledgement — distinct 3-segment path, no collision with '/:id/*'.
router.post(
  '/assignments/:assignmentId/acknowledge',
  asyncHandler(requirePermission('assets:acknowledge')),
  validate(acknowledgeHandoverSchema),
  asyncHandler(assetController.acknowledgeHandover),
);
// Handover record PDF — gated assets:view; ownership∨assign enforced in service.
router.get(
  '/assignments/:assignmentId/handover.pdf',
  asyncHandler(requirePermission('assets:view')),
  asyncHandler(assetController.downloadHandoverPdf),
);
// Handover signature image (PNG) — gated assets:view; ownership∨assign in service.
router.get(
  '/assignments/:assignmentId/signature',
  asyncHandler(requirePermission('assets:view')),
  asyncHandler(assetController.getHandoverSignature),
);

// ── Maintenance + disposal (bảo trì / thanh lý) ────────────────────────────
router.post(
  '/:id/maintenance',
  asyncHandler(requirePermission('assets:maintain')),
  validate(createMaintenanceSchema),
  asyncHandler(assetController.startMaintenance),
);
router.post(
  '/:id/maintenance/complete',
  asyncHandler(requirePermission('assets:maintain')),
  validate(completeMaintenanceSchema),
  asyncHandler(assetController.completeMaintenance),
);
router.post(
  '/:id/dispose',
  asyncHandler(requirePermission('assets:dispose')),
  validate(disposeAssetSchema),
  asyncHandler(assetController.dispose),
);

export { router as assetRoutes };
