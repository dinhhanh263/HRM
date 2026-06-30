import { Router, type Router as RouterType } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { uploadImportFile } from '../../middlewares/upload.middleware.js';
import { changeLifecycleSchema } from '../../validators/sales-customer.validator.js';
import { createDealSchema, updateDealSchema, moveDealSchema, loseDealSchema } from '../../validators/sales-deal.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';
import { salesPipelineController } from '../../controllers/sales-pipeline.controller.js';
import { salesCustomerController } from '../../controllers/sales-customer.controller.js';
import { salesCompanyController } from '../../controllers/sales-company.controller.js';
import { salesDealController } from '../../controllers/sales-deal.controller.js';
import { salesProductController } from '../../controllers/sales-product.controller.js';
import { salesQuoteController } from '../../controllers/sales-quote.controller.js';
import { salesActivityController } from '../../controllers/sales-activity.controller.js';
import { salesTaskController } from '../../controllers/sales-task.controller.js';
import { salesEmailController } from '../../controllers/sales-email.controller.js';
import { salesReportController } from '../../controllers/sales-report.controller.js';

// SPEC-045: Sales / CRM. Mọi route yêu cầu xác thực; quyền theo `sales:*`,
// visibility owner-scoped enforce ở service (Task 1.1+).
const router: RouterType = Router();

router.use(asyncHandler(authenticate));

// Pipeline đọc — nền cho Kanban; stage config (Task 2.1) gated by sales:settings.
router.get(
  '/pipelines',
  asyncHandler(requirePermission('sales:deal_view')),
  asyncHandler(salesPipelineController.listPipelines),
);
router.get(
  '/pipelines/:id/stages',
  asyncHandler(requirePermission('sales:deal_view')),
  asyncHandler(salesPipelineController.getStages),
);
router.post(
  '/pipelines/:id/stages',
  asyncHandler(requirePermission('sales:settings')),
  asyncHandler(salesPipelineController.createStage),
);
router.put(
  '/pipelines/:id/stages/reorder',
  asyncHandler(requirePermission('sales:settings')),
  asyncHandler(salesPipelineController.reorderStages),
);
router.patch(
  '/pipelines/:id/stages/:stageId',
  asyncHandler(requirePermission('sales:settings')),
  asyncHandler(salesPipelineController.updateStage),
);
router.delete(
  '/pipelines/:id/stages/:stageId',
  asyncHandler(requirePermission('sales:settings')),
  asyncHandler(salesPipelineController.deleteStage),
);

// ---- Customers / Leads (Task 1.1) ----
router.get(
  '/customers',
  asyncHandler(requirePermission('sales:customer_view')),
  asyncHandler(salesCustomerController.list),
);
// Static sub-paths must precede `/:id` so they aren't captured as an id.
router.get(
  '/customers/owners',
  asyncHandler(requirePermission('sales:customer_assign')),
  asyncHandler(salesCustomerController.listOwners),
);
router.post(
  '/customers/bulk-assign',
  asyncHandler(requirePermission('sales:customer_assign')),
  asyncHandler(salesCustomerController.bulkAssign),
);
// Import (Task 1.5) — template download + upload (dryRun preview / commit) → Lead Pool.
router.get(
  '/customers/import/template',
  asyncHandler(requirePermission('sales:customer_create')),
  asyncHandler(salesCustomerController.downloadImportTemplate),
);
router.post(
  '/customers/import',
  asyncHandler(requirePermission('sales:customer_create')),
  uploadImportFile(),
  asyncHandler(salesCustomerController.importCustomers),
);
router.post(
  '/customers',
  asyncHandler(requirePermission('sales:customer_create')),
  asyncHandler(salesCustomerController.create),
);
router.get(
  '/customers/:id',
  asyncHandler(requirePermission('sales:customer_view')),
  asyncHandler(salesCustomerController.get),
);
router.patch(
  '/customers/:id',
  asyncHandler(requirePermission('sales:customer_update')),
  asyncHandler(salesCustomerController.update),
);
// ---- Ownership / assignment (Task 1.2) ----
router.post(
  '/customers/:id/claim',
  asyncHandler(requirePermission('sales:customer_update')),
  asyncHandler(salesCustomerController.claim),
);
router.post(
  '/customers/:id/assign',
  asyncHandler(requirePermission('sales:customer_assign')),
  asyncHandler(salesCustomerController.assign),
);
router.post(
  '/customers/:id/lifecycle',
  asyncHandler(requirePermission('sales:customer_update')),
  validate(changeLifecycleSchema),
  asyncHandler(salesCustomerController.changeLifecycle),
);

// ---- Companies (B2B, Task 1.4) — share the customer permission family ----
router.get(
  '/companies',
  asyncHandler(requirePermission('sales:customer_view')),
  asyncHandler(salesCompanyController.list),
);
router.post(
  '/companies',
  asyncHandler(requirePermission('sales:customer_create')),
  asyncHandler(salesCompanyController.create),
);
router.get(
  '/companies/:id',
  asyncHandler(requirePermission('sales:customer_view')),
  asyncHandler(salesCompanyController.get),
);
router.patch(
  '/companies/:id',
  asyncHandler(requirePermission('sales:customer_update')),
  asyncHandler(salesCompanyController.update),
);

// ---- Deals (Task 2.2–2.4) ----
router.get('/deals', asyncHandler(requirePermission('sales:deal_view')), asyncHandler(salesDealController.list));
router.post('/deals', asyncHandler(requirePermission('sales:deal_create')), validate(createDealSchema), asyncHandler(salesDealController.create));
router.get('/deals/:id', asyncHandler(requirePermission('sales:deal_view')), asyncHandler(salesDealController.get));
router.patch('/deals/:id', asyncHandler(requirePermission('sales:deal_update')), validate(updateDealSchema), asyncHandler(salesDealController.update));
router.post('/deals/:id/move', asyncHandler(requirePermission('sales:deal_move')), validate(moveDealSchema), asyncHandler(salesDealController.move));
router.post('/deals/:id/win', asyncHandler(requirePermission('sales:deal_move')), asyncHandler(salesDealController.win));
router.post('/deals/:id/lose', asyncHandler(requirePermission('sales:deal_move')), validate(loseDealSchema), asyncHandler(salesDealController.lose));

// ---- Products (Task 3.1) ----
router.get('/products', asyncHandler(requirePermission('sales:product_view')), asyncHandler(salesProductController.list));
router.post('/products', asyncHandler(requirePermission('sales:product_manage')), asyncHandler(salesProductController.create));
router.patch('/products/:id', asyncHandler(requirePermission('sales:product_manage')), asyncHandler(salesProductController.update));
router.delete('/products/:id', asyncHandler(requirePermission('sales:product_manage')), asyncHandler(salesProductController.remove));

// ---- Quotes (Task 3.2) — nested under a deal; total syncs Deal.amount ----
router.get('/deals/:id/quotes', asyncHandler(requirePermission('sales:quote_view')), asyncHandler(salesQuoteController.listByDeal));
router.post('/deals/:id/quotes', asyncHandler(requirePermission('sales:quote_manage')), asyncHandler(salesQuoteController.create));
router.get('/quotes/:quoteId', asyncHandler(requirePermission('sales:quote_view')), asyncHandler(salesQuoteController.get));
router.get('/quotes/:quoteId/pdf', asyncHandler(requirePermission('sales:quote_view')), asyncHandler(salesQuoteController.pdf));

// ---- Activity feed (Task 4.1) ----
router.get('/customers/:id/activities', asyncHandler(requirePermission('sales:customer_view')), asyncHandler(salesActivityController.list));
router.post('/customers/:id/activities', asyncHandler(requirePermission('sales:customer_update')), asyncHandler(salesActivityController.addNote));

// ---- Tasks (Task 4.2) ----
router.get('/tasks/mine', asyncHandler(requirePermission('sales:task_view')), asyncHandler(salesTaskController.listMine));
router.post('/tasks', asyncHandler(requirePermission('sales:task_manage')), asyncHandler(salesTaskController.create));
router.patch('/tasks/:id', asyncHandler(requirePermission('sales:task_manage')), asyncHandler(salesTaskController.update));
router.post('/tasks/:id/complete', asyncHandler(requirePermission('sales:task_manage')), asyncHandler(salesTaskController.complete));
router.get('/customers/:id/tasks', asyncHandler(requirePermission('sales:task_view')), asyncHandler(salesTaskController.listForCustomer));

// ---- Email templates + send (Task 4.3 / 4.4) ----
router.get('/email-templates', asyncHandler(requirePermission('sales:template_manage')), asyncHandler(salesEmailController.listTemplates));
router.post('/email-templates', asyncHandler(requirePermission('sales:template_manage')), asyncHandler(salesEmailController.createTemplate));
router.patch('/email-templates/:id', asyncHandler(requirePermission('sales:template_manage')), asyncHandler(salesEmailController.updateTemplate));
router.get('/customers/:id/emails', asyncHandler(requirePermission('sales:customer_view')), asyncHandler(salesEmailController.listForCustomer));
router.post('/emails', asyncHandler(requirePermission('sales:email_send')), asyncHandler(salesEmailController.send));

// ---- Reports (Task 5.1) ----
router.get('/reports/overview', asyncHandler(requirePermission('sales:report_view')), asyncHandler(salesReportController.overview));
router.get('/reports/forecast', asyncHandler(requirePermission('sales:report_view')), asyncHandler(salesReportController.forecast));
router.get('/reports/by-owner', asyncHandler(requirePermission('sales:report_view')), asyncHandler(salesReportController.byOwner));
router.patch('/quotes/:quoteId', asyncHandler(requirePermission('sales:quote_manage')), asyncHandler(salesQuoteController.update));
router.delete('/quotes/:quoteId', asyncHandler(requirePermission('sales:quote_manage')), asyncHandler(salesQuoteController.remove));

export { router as salesRoutes };
