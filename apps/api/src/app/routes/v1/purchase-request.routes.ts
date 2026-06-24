import { Router, type Router as RouterType } from 'express';
import { purchaseRequestController } from '../../controllers/purchase-request.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import {
  createPurchaseRequestSchema,
  updatePurchaseRequestSchema,
  rejectPurchaseRequestSchema,
  approvePurchaseRequestSchema,
  markOrderedPurchaseRequestSchema,
} from '../../validators/purchase-request.validator.js';
import { uploadPurchaseFile } from '../../middlewares/purchase-upload.middleware.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();

router.use(asyncHandler(authenticate));

// ---- Purchase requests (SPEC-042) ----
router.get('/', asyncHandler(requirePermission('purchase_request:view')), asyncHandler(purchaseRequestController.listRequests));
// `/stats` and `/export` must precede `/:id` so they aren't captured as id params.
router.get('/stats', asyncHandler(requirePermission('purchase_request:view')), asyncHandler(purchaseRequestController.getStats));
router.get('/export', asyncHandler(requirePermission('purchase_request:export')), asyncHandler(purchaseRequestController.exportRequests));
router.get('/:id', asyncHandler(requirePermission('purchase_request:view')), asyncHandler(purchaseRequestController.getRequest));
// PO PDF — gated by view (+ scope/ownership in the controller); downloadable in any status.
router.get('/:id/pdf', asyncHandler(requirePermission('purchase_request:view')), asyncHandler(purchaseRequestController.getRequestPdf));
router.post('/', asyncHandler(requirePermission('purchase_request:create')), validate(createPurchaseRequestSchema), asyncHandler(purchaseRequestController.createRequest));
// PATCH is ownership-gated in the service (any owner can edit their PENDING/RETURNED draft).
router.patch('/:id', asyncHandler(requirePermission('purchase_request:view')), validate(updatePurchaseRequestSchema), asyncHandler(purchaseRequestController.updateRequest));

// ---- Attachments (quotes/contracts) ----
// Upload/delete are ownership-gated in the service; create perm gates who may attach.
router.post('/:id/attachments', asyncHandler(requirePermission('purchase_request:create')), uploadPurchaseFile(), asyncHandler(purchaseRequestController.uploadAttachment));
router.delete('/:id/attachments/:attId', asyncHandler(requirePermission('purchase_request:view')), asyncHandler(purchaseRequestController.deleteAttachment));
router.get('/:id/attachments/:attId/download', asyncHandler(requirePermission('purchase_request:view')), asyncHandler(purchaseRequestController.downloadAttachment));

// ---- Decisions ----
// approve/respond gate on the perm + "đúng người duyệt bước hiện tại" (service).
router.post('/:id/approve', asyncHandler(requirePermission('purchase_request:approve')), validate(approvePurchaseRequestSchema), asyncHandler(purchaseRequestController.approveRequest));
router.post('/:id/reject', asyncHandler(requirePermission('purchase_request:reject')), validate(rejectPurchaseRequestSchema), asyncHandler(purchaseRequestController.respondRequest));
// resubmit/cancel are ownership-gated in the service (any owner may act on their own draft).
router.post('/:id/resubmit', asyncHandler(requirePermission('purchase_request:create')), validate(updatePurchaseRequestSchema), asyncHandler(purchaseRequestController.resubmitRequest));
router.post('/:id/cancel', asyncHandler(requirePermission('purchase_request:view')), asyncHandler(purchaseRequestController.cancelRequest));
router.post('/:id/mark-ordered', asyncHandler(requirePermission('purchase_request:mark_ordered')), validate(markOrderedPurchaseRequestSchema), asyncHandler(purchaseRequestController.markOrderedRequest));

export { router as purchaseRequestRoutes };
