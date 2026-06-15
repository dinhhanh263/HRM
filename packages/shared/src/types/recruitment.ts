import type { Gender } from './employee.js';

export const StageType = {
  SOURCED: 'SOURCED',
  SCREEN: 'SCREEN',
  ASSESSMENT: 'ASSESSMENT',
  INTERVIEW: 'INTERVIEW',
  OFFER: 'OFFER',
  HIRED: 'HIRED',
  REJECTED: 'REJECTED',
} as const;

export type StageType = (typeof StageType)[keyof typeof StageType];

export interface PipelineTemplateStageDto {
  id: string;
  name: string;
  order: number;
  type: StageType;
}

export interface PipelineTemplateDto {
  id: string;
  tenantId: string;
  name: string;
  isDefault: boolean;
  stages: PipelineTemplateStageDto[];
  createdAt: string;
  updatedAt: string;
}

export interface PipelineStageInput {
  name: string;
  order: number;
  type: StageType;
}

export interface CreatePipelineTemplateRequest {
  name: string;
  isDefault?: boolean;
  stages: PipelineStageInput[];
}

export interface UpdatePipelineTemplateRequest {
  name?: string;
  isDefault?: boolean;
  stages?: PipelineStageInput[];
}

// ===== Jobs =====

export const JobStatus = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  ON_HOLD: 'ON_HOLD',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const JobEmploymentType = {
  FULL_TIME: 'FULL_TIME',
  PART_TIME: 'PART_TIME',
  CONTRACT: 'CONTRACT',
  INTERN: 'INTERN',
} as const;

export type JobEmploymentType = (typeof JobEmploymentType)[keyof typeof JobEmploymentType];

export interface JobStageDto {
  id: string;
  name: string;
  order: number;
  type: StageType;
}

interface JobDepartmentRef {
  id: string;
  name: string;
}

interface JobPositionRef {
  id: string;
  name: string;
}

export interface JobListItemDto {
  id: string;
  title: string;
  status: JobStatus;
  employmentType: JobEmploymentType;
  location: string | null;
  headcount: number;
  departmentId: string | null;
  positionId: string | null;
  department: JobDepartmentRef | null;
  position: JobPositionRef | null;
  stageCount: number;
  activeApplicationCount: number;
  openedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const HiringTeamRole = {
  RECRUITER: 'RECRUITER',
  HIRING_MANAGER: 'HIRING_MANAGER',
  INTERVIEWER: 'INTERVIEWER',
  COORDINATOR: 'COORDINATOR',
} as const;

export type HiringTeamRole = (typeof HiringTeamRole)[keyof typeof HiringTeamRole];

export interface HiringTeamMemberDto {
  id: string;
  employeeId: string;
  teamRole: HiringTeamRole;
  employee: {
    id: string;
    fullName: string;
    avatar: string | null;
    department: { name: string } | null;
    position: { name: string } | null;
  };
}

export interface JobDto extends JobListItemDto {
  tenantId: string;
  description: string | null;
  stages: JobStageDto[];
  hiringTeam: HiringTeamMemberDto[];
}

// A stage in a reorder payload: existing stages carry an id, new stages omit it.
export interface JobStageInput {
  id?: string;
  name: string;
  order: number;
  type: StageType;
}

export interface ReorderJobStagesRequest {
  stages: JobStageInput[];
}

export interface AddHiringTeamMemberRequest {
  employeeId: string;
  teamRole: HiringTeamRole;
}

export interface UpdateHiringTeamMemberRequest {
  teamRole: HiringTeamRole;
}

export interface CreateJobRequest {
  title: string;
  description?: string;
  departmentId?: string;
  positionId?: string;
  employmentType?: JobEmploymentType;
  location?: string;
  headcount?: number;
  pipelineTemplateId: string;
  status?: Extract<JobStatus, 'DRAFT' | 'OPEN'>;
}

export interface UpdateJobRequest {
  title?: string;
  description?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  employmentType?: JobEmploymentType;
  location?: string | null;
  headcount?: number;
}

export interface ChangeJobStatusRequest {
  status: JobStatus;
}

export interface JobListParams {
  search?: string;
  status?: JobStatus;
  departmentId?: string;
}

// ===== Candidates =====

export const CandidateSource = {
  CAREER_SITE: 'CAREER_SITE',
  JOB_BOARD: 'JOB_BOARD',
  REFERRAL: 'REFERRAL',
  SOURCED: 'SOURCED',
  AGENCY: 'AGENCY',
  EVENT: 'EVENT',
  DIRECT: 'DIRECT',
} as const;

export type CandidateSource = (typeof CandidateSource)[keyof typeof CandidateSource];

export interface CandidateLinks {
  linkedin?: string;
  github?: string;
  portfolio?: string;
}

export interface CandidateListItemDto {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  currentTitle: string | null;
  totalYearsExp: number | null;
  source: CandidateSource;
  avatar: string | null;
  skills: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CandidateDto extends CandidateListItemDto {
  tenantId: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  links: CandidateLinks | null;
  consentGivenAt: string | null;
  consentSource: string | null;
  retentionUntil: string | null;
}

export interface CreateCandidateRequest {
  fullName: string;
  email?: string;
  phone?: string;
  location?: string;
  currentTitle?: string;
  totalYearsExp?: number;
  source?: CandidateSource;
  links?: CandidateLinks;
  dateOfBirth?: string;
  gender?: Gender;
  skills?: string[];
  consentGivenAt?: string;
  consentSource?: string;
  retentionUntil?: string;
  // When true, bypass the soft fuzzy-name duplicate warning and create anyway.
  force?: boolean;
}

export interface UpdateCandidateRequest {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  currentTitle?: string | null;
  totalYearsExp?: number | null;
  source?: CandidateSource;
  links?: CandidateLinks | null;
  dateOfBirth?: string | null;
  gender?: Gender | null;
  skills?: string[];
  consentGivenAt?: string | null;
  consentSource?: string | null;
  retentionUntil?: string | null;
}

export interface CandidateListParams {
  search?: string;
  source?: CandidateSource;
  skills?: string[];
  minExp?: number;
  page?: number;
  limit?: number;
}

// Returned (HTTP 409) when create finds a possible same-person match the
// recruiter should review before forcing creation.
export interface CandidateDuplicateMatch {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  currentTitle: string | null;
}

// ===== Applications (Candidate × Job) =====

export const ApplicationStatus = {
  ACTIVE: 'ACTIVE',
  HIRED: 'HIRED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
  ON_HOLD: 'ON_HOLD',
} as const;

export type ApplicationStatus = (typeof ApplicationStatus)[keyof typeof ApplicationStatus];

export const RejectionReason = {
  UNDERQUALIFIED: 'UNDERQUALIFIED',
  OVERQUALIFIED: 'OVERQUALIFIED',
  FAILED_ASSESSMENT: 'FAILED_ASSESSMENT',
  CULTURE_FIT: 'CULTURE_FIT',
  COMP_MISMATCH: 'COMP_MISMATCH',
  POSITION_FILLED: 'POSITION_FILLED',
  CANDIDATE_WITHDREW: 'CANDIDATE_WITHDREW',
  NO_SHOW: 'NO_SHOW',
  OTHER: 'OTHER',
} as const;

export type RejectionReason = (typeof RejectionReason)[keyof typeof RejectionReason];

export interface ApplicationListItemDto {
  id: string;
  candidateId: string;
  jobId: string;
  currentStageId: string;
  status: ApplicationStatus;
  source: CandidateSource;
  rejectionReason: RejectionReason | null;
  appliedAt: string;
  createdAt: string;
  updatedAt: string;
  currentStage: JobStageDto;
  // Whether this application satisfies the OFFER stage gate (≥1 completed
  // interview AND ≥1 submitted scorecard). Computed only for the job board
  // (listByJob) so it can disable the OFFER move target without a round-trip;
  // undefined in single-application contexts where the gate is irrelevant.
  offerGateMet?: boolean;
}

// Application enriched with its job/candidate summaries for cross-entity lists
// (e.g. "all applications of this candidate" shows the job title).
export interface ApplicationDto extends ApplicationListItemDto {
  tenantId: string;
  candidate: {
    id: string;
    fullName: string;
    email: string | null;
    avatar: string | null;
    currentTitle: string | null;
  };
  job: {
    id: string;
    title: string;
    status: JobStatus;
  };
}

export interface CreateApplicationRequest {
  candidateId: string;
  jobId: string;
  source?: CandidateSource;
}

// Move an application to another stage of its job's pipeline. Every move is
// recorded in ApplicationStageHistory, so an optional note can annotate why.
export interface MoveApplicationRequest {
  toStageId: string;
  note?: string;
  // Opt-in override of a soft stage gate (e.g. OFFER). Only effective for an
  // actor holding recruitment:application_force_move, and then the note becomes
  // a mandatory reason recorded in the stage history.
  force?: boolean;
}

// Reject keeps the stage where the candidate dropped (so funnel analytics show
// at which step they were rejected) and records why.
export interface RejectApplicationRequest {
  rejectionReason: RejectionReason;
  note?: string;
}

// Hire moves the application to its pipeline's HIRED stage and closes it.
export interface HireApplicationRequest {
  note?: string;
}

// Withdraw closes the application (candidate pulled out) and keeps the stage.
export interface WithdrawApplicationRequest {
  note?: string;
}

// ===== Application activity feed (notes + system events) =====

// System events are recorded automatically; NOTE is an internal comment a
// recruiter writes. Stored as a string so new event types don't need a migration.
export type ApplicationActivityType =
  | 'APPLIED'
  | 'STAGE_CHANGED'
  | 'NOTE'
  | 'INTERVIEW_SCHEDULED'
  | 'REJECTED'
  | 'HIRED'
  | 'WITHDRAWN';

export interface ApplicationActivityDto {
  id: string;
  type: ApplicationActivityType;
  body: string | null;
  // null when the event was generated by the system rather than a person.
  author: {
    id: string;
    fullName: string;
    avatar: string | null;
  } | null;
  createdAt: string;
}

export interface CreateApplicationNoteRequest {
  body: string;
}

// ===== Candidate attachments (CV / documents) =====

export const AttachmentKind = {
  CV: 'CV',
  COVER_LETTER: 'COVER_LETTER',
  OTHER: 'OTHER',
} as const;

export type AttachmentKind = (typeof AttachmentKind)[keyof typeof AttachmentKind];

export const ParseStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  DONE: 'DONE',
  FAILED: 'FAILED',
} as const;

export type ParseStatus = (typeof ParseStatus)[keyof typeof ParseStatus];

// Structured fields a parser extracts from a CV. Every field is a suggestion —
// the UI lets a recruiter confirm before they overwrite the candidate record.
export interface ParsedResume {
  fullName?: string;
  email?: string;
  phone?: string;
  currentTitle?: string;
  totalYearsExp?: number;
  skills: string[];
  links?: CandidateLinks;
}

export interface CandidateAttachmentDto {
  id: string;
  candidateId: string;
  kind: AttachmentKind;
  fileName: string;
  fileUrl: string;
  parseStatus: ParseStatus;
  parserProvider: string | null;
  parsedAt: string | null;
  // Whether plain text could be extracted from this file at upload time.
  // false for image-scanned PDFs where no selectable text exists.
  hasText: boolean;
  // Structured suggestion from the parser, present once parseStatus === 'DONE'.
  parsed: ParsedResume | null;
  createdAt: string;
}

// ===== Interviews (SPEC-024 Phase 5) =====

export const InterviewMode = {
  ONSITE: 'ONSITE',
  VIDEO: 'VIDEO',
  PHONE: 'PHONE',
} as const;

export type InterviewMode = (typeof InterviewMode)[keyof typeof InterviewMode];

export const InterviewStatus = {
  SCHEDULED: 'SCHEDULED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
} as const;

export type InterviewStatus = (typeof InterviewStatus)[keyof typeof InterviewStatus];

// A SCHEDULED interview can move to exactly one terminal outcome; terminal
// states are frozen so the interview record stays an honest audit of what happened.
export type InterviewTerminalStatus = Exclude<InterviewStatus, 'SCHEDULED'>;

export interface InterviewInterviewerDto {
  employeeId: string;
  fullName: string;
  avatar: string | null;
}

export interface InterviewDto {
  id: string;
  tenantId: string;
  applicationId: string;
  stageId: string | null;
  scheduledAt: string;
  durationMin: number;
  mode: InterviewMode;
  location: string | null;
  meetingUrl: string | null;
  status: InterviewStatus;
  interviewers: InterviewInterviewerDto[];
  createdAt: string;
  updatedAt: string;
}

// An interview from the interviewer's own perspective, used across every tab of
// "PV của tôi" (upcoming / awaiting evaluation / evaluated): enriched with the
// candidate + job so they can prepare or evaluate without extra fetches.
export interface MyInterviewListItemDto extends InterviewDto {
  candidate: {
    id: string;
    fullName: string;
    avatar: string | null;
    currentTitle: string | null;
  };
  job: {
    id: string;
    title: string;
  };
  // Whether the requesting interviewer has already submitted their own scorecard
  // for this interview — drives "Nhập đánh giá" vs "Sửa đánh giá" on the card.
  myScorecardSubmitted: boolean;
}

// The interviewer's personal interview workspace ("PV của tôi"):
//  - upcoming: SCHEDULED interviews still in the future (prep before the call).
//  - toReview: interviews that already happened (COMPLETED, or SCHEDULED but past)
//    where the interviewer needs to enter — or may revise — their scorecard.
export interface MyInterviewsDto {
  upcoming: MyInterviewListItemDto[];
  toReview: MyInterviewListItemDto[];
}

export interface CreateInterviewRequest {
  applicationId: string;
  scheduledAt: string;
  durationMin?: number;
  mode?: InterviewMode;
  location?: string;
  meetingUrl?: string;
  // Employee ids assigned to conduct the interview — at least one required.
  interviewerIds: string[];
}

export interface UpdateInterviewStatusRequest {
  status: InterviewTerminalStatus;
}

// ===== Scorecards (SPEC-024 Phase 5.2) =====

// The interviewer's overall hire recommendation. Ordered worst→best so it maps
// cleanly onto a 1..4 numeric scale for averaging (see SCORECARD_OVERALL_SCORE).
export const ScorecardOverall = {
  STRONG_NO: 'STRONG_NO',
  NO: 'NO',
  YES: 'YES',
  STRONG_YES: 'STRONG_YES',
} as const;

export type ScorecardOverall = (typeof ScorecardOverall)[keyof typeof ScorecardOverall];

// Numeric weight per overall verdict — the single source of truth for the
// average recommendation shown in the application summary.
export const SCORECARD_OVERALL_SCORE: Record<ScorecardOverall, number> = {
  STRONG_NO: 1,
  NO: 2,
  YES: 3,
  STRONG_YES: 4,
};

// Fixed evaluation criteria. `ratings` holds a subset of these, each scored 1..4.
export const SCORECARD_CRITERIA = [
  'TECHNICAL',
  'COMMUNICATION',
  'PROBLEM_SOLVING',
  'CULTURE_FIT',
] as const;

export type ScorecardCriterion = (typeof SCORECARD_CRITERIA)[number];

export interface ScorecardDto {
  id: string;
  interviewId: string;
  interviewer: {
    employeeId: string;
    fullName: string;
    avatar: string | null;
  };
  overall: ScorecardOverall;
  ratings: Record<string, number> | null;
  notes: string | null;
  submittedAt: string | null;
  // True when this scorecard belongs to the requesting user.
  isMine: boolean;
}

// No-peek view of one interview's scorecards. A peer interviewer only sees
// others' cards once they have submitted their own (bias prevention); a
// non-interviewer viewer with application_view sees all submitted cards.
export interface InterviewScorecardsDto {
  interviewId: string;
  // True when the requesting user is on the interview panel and may therefore
  // submit/edit their own scorecard.
  isInterviewer: boolean;
  canViewOthers: boolean;
  mine: ScorecardDto | null;
  others: ScorecardDto[];
  submittedCount: number;
  totalInterviewers: number;
}

export interface SubmitScorecardRequest {
  overall: ScorecardOverall;
  ratings?: Record<string, number>;
  notes?: string;
}

// Aggregated read for the application detail: one row per interview that has at
// least one assigned interviewer, with submission progress + average score.
export interface ScorecardSummaryItemDto {
  interviewId: string;
  scheduledAt: string;
  mode: InterviewMode;
  status: InterviewStatus;
  submittedCount: number;
  totalInterviewers: number;
  // Average of submitted verdicts on the 1..4 scale, or null if none submitted.
  // Null as well when redacted (no-peek): the caller is an assigned interviewer
  // on this interview who has not submitted their own scorecard yet.
  averageScore: number | null;
  recommendations: Array<{
    interviewer: { employeeId: string; fullName: string; avatar: string | null };
    overall: ScorecardOverall;
  }>;
  // True when peer verdicts are hidden because no-peek applies to the caller for
  // this interview. submittedCount/totalInterviewers stay visible as progress.
  redacted: boolean;
}

// ===== Bulk CV intake (SPEC-027) =====

// Limits enforced on the upload endpoint (multer) and mirrored in the UI.
export const BULK_IMPORT_MAX_FILES = 50;
export const BULK_IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

export const BulkImportStatus = {
  DRAFT: 'DRAFT',
  REVIEWING: 'REVIEWING',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
} as const;

export type BulkImportStatus = (typeof BulkImportStatus)[keyof typeof BulkImportStatus];

export const BulkImportItemStatus = {
  PARSING: 'PARSING',
  PARSED: 'PARSED',
  PARSE_FAILED: 'PARSE_FAILED',
  CONFIRMED: 'CONFIRMED',
  SKIPPED: 'SKIPPED',
  FAILED: 'FAILED',
} as const;

export type BulkImportItemStatus =
  (typeof BulkImportItemStatus)[keyof typeof BulkImportItemStatus];

// HR's decision for each item at confirm time.
export const BulkImportItemResolution = {
  NEW: 'NEW',
  LINK_EXISTING: 'LINK_EXISTING',
  SKIP: 'SKIP',
} as const;

export type BulkImportItemResolution =
  (typeof BulkImportItemResolution)[keyof typeof BulkImportItemResolution];

// Candidate the dedup pass matched against (existing or earlier in the same batch).
export interface BulkImportDuplicateMatch {
  candidateId: string | null;
  reason: string;
}

export interface BulkImportItemDto {
  id: string;
  status: BulkImportItemStatus;
  resolution: BulkImportItemResolution;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  // false for image-scanned PDFs where no selectable text could be extracted.
  hasText: boolean;
  parseStatus: ParseStatus;
  parserProvider: string | null;
  // Parser suggestion; present once parseStatus === 'DONE'.
  parsed: ParsedResume | null;
  // HR's edited copy, defaulting to `parsed` then overlaid with their changes.
  reviewed: ParsedResume | null;
  // Soft-dedup outcome — non-null when this CV looks like an existing/earlier candidate.
  duplicateOfCandidateId: string | null;
  duplicateReason: string | null;
  // Populated after a successful confirm.
  candidateId: string | null;
  applicationId: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface BulkImportBatchDto {
  id: string;
  tenantId: string;
  jobId: string;
  status: BulkImportStatus;
  totalItems: number;
  createdAt: string;
  confirmedAt: string | null;
  items: BulkImportItemDto[];
}

// Edit one item before confirm: overwrite parsed fields, change resolution, or skip.
export interface UpdateBulkImportItemRequest {
  reviewed?: ParsedResume;
  resolution?: BulkImportItemResolution;
}

// Per-item outcome of a confirm run — non-atomic; each item commits independently.
export interface BulkImportConfirmResultDto {
  batch: BulkImportBatchDto;
  summary: {
    created: number;
    linked: number;
    skipped: number;
    failed: number;
  };
}
