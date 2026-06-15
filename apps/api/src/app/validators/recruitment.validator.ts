import { z } from 'zod';

// z.string().url() accepts any URL the WHATWG parser allows, including
// javascript:, data: and vbscript: — these are stored-XSS vectors once rendered
// as an href. Restrict candidate links / meeting URLs to http(s) only.
const httpUrl = (max: number) =>
  z
    .string()
    .url()
    .max(max)
    .refine((v) => /^https?:\/\//i.test(v), {
      message: 'Chỉ chấp nhận đường dẫn http(s)',
    });

export const stageTypeEnum = z.enum([
  'SOURCED',
  'SCREEN',
  'ASSESSMENT',
  'INTERVIEW',
  'OFFER',
  'HIRED',
  'REJECTED',
]);

const stageInputSchema = z.object({
  name: z.string().min(1, 'Stage name is required').max(80),
  order: z.number().int().min(0),
  type: stageTypeEnum,
});

// A pipeline must end with the two terminal stages so every application has a
// place to land when hired or rejected.
function assertValidStages(stages: { order: number; type: string }[], ctx: z.RefinementCtx) {
  const orders = stages.map((s) => s.order);
  if (new Set(orders).size !== orders.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Stage orders must be unique' });
  }
  if (!stages.some((s) => s.type === 'HIRED')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pipeline must include a HIRED stage' });
  }
  if (!stages.some((s) => s.type === 'REJECTED')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pipeline must include a REJECTED stage' });
  }
}

export const createPipelineTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(100),
  isDefault: z.boolean().optional(),
  stages: z.array(stageInputSchema).min(2, 'At least two stages are required').superRefine(assertValidStages),
});

export const updatePipelineTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isDefault: z.boolean().optional(),
  stages: z.array(stageInputSchema).min(2).superRefine(assertValidStages).optional(),
});

export type CreatePipelineTemplateInput = z.infer<typeof createPipelineTemplateSchema>;
export type UpdatePipelineTemplateInput = z.infer<typeof updatePipelineTemplateSchema>;

// ===== Jobs =====

export const jobEmploymentTypeEnum = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']);
export const jobStatusEnum = z.enum(['DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED', 'CANCELLED']);

export const createJobSchema = z.object({
  title: z.string().min(1, 'Job title is required').max(150),
  description: z.string().max(10000).optional(),
  departmentId: z.string().min(1).optional(),
  positionId: z.string().min(1).optional(),
  employmentType: jobEmploymentTypeEnum.optional(),
  location: z.string().max(150).optional(),
  headcount: z.number().int().min(1).max(1000).optional(),
  pipelineTemplateId: z.string().min(1, 'Pipeline template is required'),
  // New jobs may only start as DRAFT or OPEN; other states require a transition.
  status: z.enum(['DRAFT', 'OPEN']).optional(),
});

export const updateJobSchema = z.object({
  title: z.string().min(1).max(150).optional(),
  description: z.string().max(10000).nullable().optional(),
  departmentId: z.string().min(1).nullable().optional(),
  positionId: z.string().min(1).nullable().optional(),
  employmentType: jobEmploymentTypeEnum.optional(),
  location: z.string().max(150).nullable().optional(),
  headcount: z.number().int().min(1).max(1000).optional(),
});

export const changeJobStatusSchema = z.object({
  status: jobStatusEnum,
});

// ===== Job stage editor =====

// Like stageInputSchema but existing stages carry an id (new stages omit it).
const jobStageInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1, 'Stage name is required').max(80),
  order: z.number().int().min(0),
  type: stageTypeEnum,
});

export const reorderJobStagesSchema = z.object({
  stages: z
    .array(jobStageInputSchema)
    .min(2, 'At least two stages are required')
    .superRefine(assertValidStages),
});

// ===== Hiring team =====

export const hiringTeamRoleEnum = z.enum([
  'RECRUITER',
  'HIRING_MANAGER',
  'INTERVIEWER',
  'COORDINATOR',
]);

export const addHiringTeamMemberSchema = z.object({
  employeeId: z.string().min(1, 'Employee is required'),
  teamRole: hiringTeamRoleEnum,
});

export const updateHiringTeamMemberSchema = z.object({
  teamRole: hiringTeamRoleEnum,
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type ChangeJobStatusInput = z.infer<typeof changeJobStatusSchema>;
export type ReorderJobStagesInput = z.infer<typeof reorderJobStagesSchema>;
export type AddHiringTeamMemberInput = z.infer<typeof addHiringTeamMemberSchema>;
export type UpdateHiringTeamMemberInput = z.infer<typeof updateHiringTeamMemberSchema>;

// ===== Candidates =====

export const candidateSourceEnum = z.enum([
  'CAREER_SITE',
  'JOB_BOARD',
  'REFERRAL',
  'SOURCED',
  'AGENCY',
  'EVENT',
  'DIRECT',
]);

export const genderEnum = z.enum(['MALE', 'FEMALE', 'OTHER']);

const candidateLinksSchema = z.object({
  linkedin: httpUrl(300).optional(),
  github: httpUrl(300).optional(),
  portfolio: httpUrl(300).optional(),
});

const isoDate = z.string().datetime({ offset: true }).or(z.string().date());

export const createCandidateSchema = z.object({
  fullName: z.string().min(1, 'Họ tên là bắt buộc').max(150),
  email: z.string().email().max(255).optional(),
  phone: z.string().min(1).max(30).optional(),
  location: z.string().max(150).optional(),
  currentTitle: z.string().max(150).optional(),
  totalYearsExp: z.number().min(0).max(80).optional(),
  source: candidateSourceEnum.optional(),
  links: candidateLinksSchema.optional(),
  dateOfBirth: isoDate.optional(),
  gender: genderEnum.optional(),
  skills: z.array(z.string().min(1).max(60)).max(100).optional(),
  consentGivenAt: isoDate.optional(),
  consentSource: z.string().max(150).optional(),
  retentionUntil: isoDate.optional(),
  force: z.boolean().optional(),
});

export const updateCandidateSchema = z.object({
  fullName: z.string().min(1).max(150).optional(),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  location: z.string().max(150).nullable().optional(),
  currentTitle: z.string().max(150).nullable().optional(),
  totalYearsExp: z.number().min(0).max(80).nullable().optional(),
  source: candidateSourceEnum.optional(),
  links: candidateLinksSchema.nullable().optional(),
  dateOfBirth: isoDate.nullable().optional(),
  gender: genderEnum.nullable().optional(),
  skills: z.array(z.string().min(1).max(60)).max(100).optional(),
  consentGivenAt: isoDate.nullable().optional(),
  consentSource: z.string().max(150).nullable().optional(),
  retentionUntil: isoDate.nullable().optional(),
});

export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;

// ===== Applications =====

export const createApplicationSchema = z.object({
  candidateId: z.string().min(1, 'Candidate is required'),
  jobId: z.string().min(1, 'Job is required'),
  source: candidateSourceEnum.optional(),
});

export const moveApplicationSchema = z.object({
  toStageId: z.string().min(1, 'Target stage is required'),
  note: z.string().max(500).optional(),
  // Opt-in override of a soft stage gate (e.g. OFFER). Only honoured for actors
  // holding recruitment:application_force_move; the service enforces that + a reason.
  force: z.boolean().optional(),
});

export const rejectionReasonEnum = z.enum([
  'UNDERQUALIFIED',
  'OVERQUALIFIED',
  'FAILED_ASSESSMENT',
  'CULTURE_FIT',
  'COMP_MISMATCH',
  'POSITION_FILLED',
  'CANDIDATE_WITHDREW',
  'NO_SHOW',
  'OTHER',
]);

export const rejectApplicationSchema = z.object({
  rejectionReason: rejectionReasonEnum,
  note: z.string().max(500).optional(),
});

export const hireApplicationSchema = z.object({
  note: z.string().max(500).optional(),
});

export const withdrawApplicationSchema = z.object({
  note: z.string().max(500).optional(),
});

export const createApplicationNoteSchema = z.object({
  body: z.string().trim().min(1, 'Nội dung ghi chú không được để trống').max(2000),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type MoveApplicationInput = z.infer<typeof moveApplicationSchema>;
export type RejectApplicationInput = z.infer<typeof rejectApplicationSchema>;
export type HireApplicationInput = z.infer<typeof hireApplicationSchema>;
export type WithdrawApplicationInput = z.infer<typeof withdrawApplicationSchema>;
export type CreateApplicationNoteInput = z.infer<typeof createApplicationNoteSchema>;

// ===== Interviews =====

export const interviewModeEnum = z.enum(['ONSITE', 'VIDEO', 'PHONE']);

// Status transitions are one-way out of SCHEDULED, so the API only ever accepts
// a terminal outcome — SCHEDULED itself is set at creation, never via this route.
export const interviewTerminalStatusEnum = z.enum(['COMPLETED', 'CANCELLED', 'NO_SHOW']);

export const createInterviewSchema = z.object({
  applicationId: z.string().min(1, 'Application is required'),
  scheduledAt: z.string().datetime({ offset: true }),
  durationMin: z.number().int().min(5).max(600).optional(),
  mode: interviewModeEnum.optional(),
  location: z.string().max(255).optional(),
  meetingUrl: httpUrl(500).optional(),
  interviewerIds: z
    .array(z.string().min(1))
    .min(1, 'At least one interviewer is required')
    .max(20),
});

export const updateInterviewStatusSchema = z.object({
  status: interviewTerminalStatusEnum,
});

export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;
export type UpdateInterviewStatusInput = z.infer<typeof updateInterviewStatusSchema>;

// ===== Scorecards =====

export const scorecardOverallEnum = z.enum(['STRONG_NO', 'NO', 'YES', 'STRONG_YES']);

// Ratings are an open map of criterion → 1..4; the criteria set is a UI concern,
// so the API only enforces the numeric bound, not the key names.
export const submitScorecardSchema = z.object({
  overall: scorecardOverallEnum,
  ratings: z.record(z.string(), z.number().int().min(1).max(4)).optional(),
  notes: z.string().max(5000).optional(),
});

export type SubmitScorecardInput = z.infer<typeof submitScorecardSchema>;

// ===== Bulk CV intake =====

export const bulkImportItemResolutionEnum = z.enum(['NEW', 'LINK_EXISTING', 'SKIP']);

// HR's edited copy of the parser suggestion. Mirrors ParsedResume; all fields
// optional so a PATCH can touch just one. skills defaults via the service.
const reviewedResumeSchema = z.object({
  fullName: z.string().min(1).max(150).optional(),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(30).optional(),
  currentTitle: z.string().max(150).optional(),
  totalYearsExp: z.number().min(0).max(80).optional(),
  skills: z.array(z.string().min(1).max(60)).max(100).optional(),
  links: candidateLinksSchema.optional(),
});

// At least one of reviewed/resolution must be present — an empty PATCH is a
// client bug, not a no-op we want to silently accept.
export const updateBulkItemSchema = z
  .object({
    reviewed: reviewedResumeSchema.optional(),
    resolution: bulkImportItemResolutionEnum.optional(),
  })
  .refine((v) => v.reviewed !== undefined || v.resolution !== undefined, {
    message: 'Cần ít nhất một thay đổi (reviewed hoặc resolution)',
  });

export type UpdateBulkItemInput = z.infer<typeof updateBulkItemSchema>;
