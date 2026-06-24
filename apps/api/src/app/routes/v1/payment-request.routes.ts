import { Router, type Router as RouterType } from 'express';
import { paymentRequestController } from '../../controllers/payment-request.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import {
  createPaymentRequestSchema,
  updatePaymentRequestSchema,
  rejectPaymentRequestSchema,
  approvePaymentRequestSchema,
  markPaidPaymentRequestSchema,
} from '../../validators/payment-request.validator.js';
import { uploadPaymentFile } from '../../middlewares/payment-upload.middleware.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();

router.use(asyncHandler(authenticate));

// ---- Payment requests (SPEC-041) ----
router.get('/', asyncHandler(requirePermission('payment_request:view')), asyncHandler(paymentRequestController.listRequests));
// `/stats` and `/export` must precede `/:id` so they aren't captured as id params.
router.get('/stats', asyncHandler(requirePermission('payment_request:view')), asyncHandler(paymentRequestController.getStats));
router.get('/export', asyncHandler(requirePermission('payment_request:export')), asyncHandler(paymentRequestController.exportRequests));
router.get('/:id', asyncHandler(requirePermission('payment_request:view')), asyncHandler(paymentRequestController.getRequest));
router.post('/', asyncHandler(requirePermission('payment_request:create')), validate(createPaymentRequestSchema), asyncHandler(paymentRequestController.createRequest));
// PATCH is ownership-gated in the service (any owner can edit their PENDING/RETURNED draft).
router.patch('/:id', asyncHandler(requirePermission('payment_request:view')), validate(updatePaymentRequestSchema), asyncHandler(paymentRequestController.updateRequest));

// ---- Attachments (invoices/bills) ----
// Upload/delete are ownership-gated in the service; create perm gates who may attach.
router.post('/:id/attachments', asyncHandler(requirePermission('payment_request:create')), uploadPaymentFile(), asyncHandler(paymentRequestController.uploadAttachment));
router.delete('/:id/attachments/:attId', asyncHandler(requirePermission('payment_request:view')), asyncHandler(paymentRequestController.deleteAttachment));
router.get('/:id/attachments/:attId/download', asyncHandler(requirePermission('payment_request:view')), asyncHandler(paymentRequestController.downloadAttachment));

// ---- Decisions ----
// approve/respond gate on the perm + "đúng người duyệt bước hiện tại" (service).
router.post('/:id/approve', asyncHandler(requirePermission('payment_request:approve')), validate(approvePaymentRequestSchema), asyncHandler(paymentRequestController.approveRequest));
router.post('/:id/reject', asyncHandler(requirePermission('payment_request:reject')), validate(rejectPaymentRequestSchema), asyncHandler(paymentRequestController.respondRequest));
// resubmit/cancel are ownership-gated in the service (any owner may act on their own draft).
router.post('/:id/resubmit', asyncHandler(requirePermission('payment_request:create')), validate(createPaymentRequestSchema), asyncHandler(paymentRequestController.resubmitRequest));
router.post('/:id/cancel', asyncHandler(requirePermission('payment_request:view')), asyncHandler(paymentRequestController.cancelRequest));
router.post('/:id/mark-paid', asyncHandler(requirePermission('payment_request:mark_paid')), validate(markPaidPaymentRequestSchema), asyncHandler(paymentRequestController.markPaidRequest));

export { router as paymentRequestRoutes };
