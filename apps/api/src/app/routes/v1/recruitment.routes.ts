import { Router, type Router as RouterType } from 'express';
import { recruitmentController } from '../../controllers/recruitment.controller.js';
import { pipelineTemplateController } from '../../controllers/pipeline-template.controller.js';
import { jobController } from '../../controllers/job.controller.js';
import { candidateController } from '../../controllers/candidate.controller.js';
import { applicationController } from '../../controllers/application.controller.js';
import { interviewController } from '../../controllers/interview.controller.js';
import { scorecardController } from '../../controllers/scorecard.controller.js';
import { bulkImportController } from '../../controllers/bulk-import.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission, requireAnyPermission } from '../../middlewares/authorize.middleware.js';
import { uploadCvFile, uploadCvFiles } from '../../middlewares/cv-upload.middleware.js';
import {
  createPipelineTemplateSchema,
  updatePipelineTemplateSchema,
  createJobSchema,
  updateJobSchema,
  changeJobStatusSchema,
  reorderJobStagesSchema,
  addHiringTeamMemberSchema,
  updateHiringTeamMemberSchema,
  createCandidateSchema,
  updateCandidateSchema,
  createApplicationSchema,
  moveApplicationSchema,
  rejectApplicationSchema,
  hireApplicationSchema,
  withdrawApplicationSchema,
  createApplicationNoteSchema,
  createInterviewSchema,
  updateInterviewStatusSchema,
  submitScorecardSchema,
  updateBulkItemSchema,
} from '../../validators/recruitment.validator.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';

const router: RouterType = Router();

router.use(asyncHandler(authenticate));

router.get(
  '/ping',
  asyncHandler(requirePermission('recruitment:job_view')),
  asyncHandler(recruitmentController.ping),
);

// ===== Pipeline templates (tenant-scoped) =====
router.get(
  '/pipeline-templates',
  asyncHandler(requirePermission('recruitment:job_update')),
  asyncHandler(pipelineTemplateController.getAll),
);
router.get(
  '/pipeline-templates/:id',
  asyncHandler(requirePermission('recruitment:job_update')),
  asyncHandler(pipelineTemplateController.getById),
);
router.post(
  '/pipeline-templates',
  asyncHandler(requirePermission('recruitment:job_update')),
  validate(createPipelineTemplateSchema),
  asyncHandler(pipelineTemplateController.create),
);
router.patch(
  '/pipeline-templates/:id',
  asyncHandler(requirePermission('recruitment:job_update')),
  validate(updatePipelineTemplateSchema),
  asyncHandler(pipelineTemplateController.update),
);
router.delete(
  '/pipeline-templates/:id',
  asyncHandler(requirePermission('recruitment:job_update')),
  asyncHandler(pipelineTemplateController.delete),
);

// ===== Jobs (tenant-scoped) =====
router.get(
  '/jobs',
  asyncHandler(requirePermission('recruitment:job_view')),
  asyncHandler(jobController.getAll),
);
router.get(
  '/jobs/:id',
  asyncHandler(requirePermission('recruitment:job_view')),
  asyncHandler(jobController.getById),
);
router.post(
  '/jobs',
  asyncHandler(requirePermission('recruitment:job_create')),
  validate(createJobSchema),
  asyncHandler(jobController.create),
);
router.patch(
  '/jobs/:id',
  asyncHandler(requirePermission('recruitment:job_update')),
  validate(updateJobSchema),
  asyncHandler(jobController.update),
);
router.patch(
  '/jobs/:id/status',
  asyncHandler(requirePermission('recruitment:job_update')),
  validate(changeJobStatusSchema),
  asyncHandler(jobController.changeStatus),
);

// ===== Job stage editor =====
router.put(
  '/jobs/:id/stages',
  asyncHandler(requirePermission('recruitment:job_update')),
  validate(reorderJobStagesSchema),
  asyncHandler(jobController.reorderStages),
);

// ===== Hiring team =====
router.post(
  '/jobs/:id/hiring-team',
  asyncHandler(requirePermission('recruitment:job_update')),
  validate(addHiringTeamMemberSchema),
  asyncHandler(jobController.addHiringTeamMember),
);
router.patch(
  '/jobs/:id/hiring-team/:memberId',
  asyncHandler(requirePermission('recruitment:job_update')),
  validate(updateHiringTeamMemberSchema),
  asyncHandler(jobController.updateHiringTeamMember),
);
router.delete(
  '/jobs/:id/hiring-team/:memberId',
  asyncHandler(requirePermission('recruitment:job_update')),
  asyncHandler(jobController.removeHiringTeamMember),
);

// ===== Bulk CV intake (SPEC-027) =====
// Drag-drop many CVs against a job. Stores files + creates a staging batch and
// enqueues parsing; no candidate/application is created until confirm.
router.post(
  '/jobs/:jobId/bulk-import',
  asyncHandler(requirePermission('recruitment:bulk_import')),
  uploadCvFiles(),
  asyncHandler(bulkImportController.create),
);
router.get(
  '/bulk-import/:batchId',
  asyncHandler(requirePermission('recruitment:bulk_import')),
  asyncHandler(bulkImportController.getBatch),
);
router.patch(
  '/bulk-import/:batchId/items/:itemId',
  asyncHandler(requirePermission('recruitment:bulk_import')),
  validate(updateBulkItemSchema),
  asyncHandler(bulkImportController.updateItem),
);
router.delete(
  '/bulk-import/:batchId',
  asyncHandler(requirePermission('recruitment:bulk_import')),
  asyncHandler(bulkImportController.cancel),
);
router.post(
  '/bulk-import/:batchId/confirm',
  asyncHandler(requirePermission('recruitment:bulk_import')),
  asyncHandler(bulkImportController.confirm),
);

// ===== Candidates (tenant-scoped) =====
router.get(
  '/candidates',
  asyncHandler(requirePermission('recruitment:candidate_view')),
  asyncHandler(candidateController.getAll),
);
router.get(
  '/candidates/:id',
  asyncHandler(requirePermission('recruitment:candidate_view')),
  asyncHandler(candidateController.getById),
);
router.post(
  '/candidates',
  asyncHandler(requirePermission('recruitment:candidate_create')),
  validate(createCandidateSchema),
  asyncHandler(candidateController.create),
);
router.patch(
  '/candidates/:id',
  asyncHandler(requirePermission('recruitment:candidate_update')),
  validate(updateCandidateSchema),
  asyncHandler(candidateController.update),
);

// ===== Candidate CV attachments =====
router.get(
  '/candidates/:id/attachments',
  asyncHandler(requirePermission('recruitment:candidate_view')),
  asyncHandler(candidateController.listAttachments),
);
router.get(
  '/candidates/:id/attachments/:attachmentId/download',
  asyncHandler(requirePermission('recruitment:candidate_view')),
  asyncHandler(candidateController.downloadAttachment),
);
router.post(
  '/candidates/:id/attachments',
  asyncHandler(requirePermission('recruitment:candidate_update')),
  uploadCvFile(),
  asyncHandler(candidateController.uploadAttachment),
);
router.post(
  '/candidates/:id/attachments/:attachmentId/parse',
  asyncHandler(requirePermission('recruitment:candidate_update')),
  asyncHandler(candidateController.reparseAttachment),
);

// ===== Applications (Candidate × Job) =====
router.post(
  '/applications',
  asyncHandler(requirePermission('recruitment:application_create')),
  validate(createApplicationSchema),
  asyncHandler(applicationController.create),
);
router.get(
  '/candidates/:id/applications',
  asyncHandler(requirePermission('recruitment:application_view')),
  asyncHandler(applicationController.listByCandidate),
);
router.get(
  '/jobs/:id/applications',
  asyncHandler(requirePermission('recruitment:application_view')),
  asyncHandler(applicationController.listByJob),
);
router.patch(
  '/applications/:id/move',
  asyncHandler(requirePermission('recruitment:application_move')),
  validate(moveApplicationSchema),
  asyncHandler(applicationController.move),
);
router.patch(
  '/applications/:id/reject',
  asyncHandler(requirePermission('recruitment:application_reject')),
  validate(rejectApplicationSchema),
  asyncHandler(applicationController.reject),
);
router.patch(
  '/applications/:id/hire',
  asyncHandler(requirePermission('recruitment:application_hire')),
  validate(hireApplicationSchema),
  asyncHandler(applicationController.hire),
);
router.patch(
  '/applications/:id/withdraw',
  asyncHandler(requirePermission('recruitment:application_withdraw')),
  validate(withdrawApplicationSchema),
  asyncHandler(applicationController.withdraw),
);
router.get(
  '/applications/:id',
  asyncHandler(requirePermission('recruitment:application_view')),
  asyncHandler(applicationController.getById),
);
router.get(
  '/applications/:id/activities',
  asyncHandler(requirePermission('recruitment:application_view')),
  asyncHandler(applicationController.listActivities),
);
router.post(
  '/applications/:id/notes',
  asyncHandler(requirePermission('recruitment:application_note')),
  validate(createApplicationNoteSchema),
  asyncHandler(applicationController.createNote),
);

// ===== Interviews =====
// "PV của tôi" — self-scoped (upcoming + awaiting-scorecard), so gated on the
// interviewer-capability permission (scorecard_submit) which employees who conduct
// interviews also hold.
router.get(
  '/interviews/mine',
  asyncHandler(requirePermission('recruitment:scorecard_submit')),
  asyncHandler(interviewController.listMine),
);
router.post(
  '/interviews',
  asyncHandler(requirePermission('recruitment:interview_schedule')),
  validate(createInterviewSchema),
  asyncHandler(interviewController.create),
);
router.get(
  '/applications/:id/interviews',
  asyncHandler(requirePermission('recruitment:application_view')),
  asyncHandler(interviewController.listByApplication),
);
router.patch(
  '/applications/:id/interviews/:interviewId/status',
  asyncHandler(requirePermission('recruitment:interview_schedule')),
  validate(updateInterviewStatusSchema),
  asyncHandler(interviewController.updateStatus),
);

// ===== Scorecards =====
// Submitting is an interviewer-only act (service re-checks assignment); the read
// is shared between interviewers (subject to no-peek) and application_view holders.
router.put(
  '/interviews/:interviewId/scorecard',
  asyncHandler(requirePermission('recruitment:scorecard_submit')),
  validate(submitScorecardSchema),
  asyncHandler(scorecardController.submit),
);
router.get(
  '/interviews/:interviewId/scorecards',
  asyncHandler(
    requireAnyPermission('recruitment:scorecard_submit', 'recruitment:application_view')
  ),
  asyncHandler(scorecardController.listForInterview),
);
router.get(
  '/applications/:id/scorecard-summary',
  asyncHandler(requirePermission('recruitment:application_view')),
  asyncHandler(scorecardController.summaryByApplication),
);

export { router as recruitmentRoutes };
